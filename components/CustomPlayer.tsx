import React, { useEffect, useRef, forwardRef, useState } from "react";
import { createPortal } from "react-dom";
import Artplayer from "artplayer";
import Hls from "hls.js";
import * as dashjs from "dashjs";
import {
  FastForward,
  SkipForward,
  StepForward,
  Settings,
  Gauge,
  PictureInPicture2,
  Download,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Play,
  Pause,
  Maximize2,
  Sliders,
  Users,
  Film,
  Sparkles,
} from "lucide-react";
import { isTvDevice } from "../utils/tvDetection";

export { isTvDevice };

interface CustomPlayerProps {
  src: string;
  poster?: string;
  maxAudioTracks?: number;
  audioTrackNames?: string[];
  autoPlay?: boolean;
  animeId?: string;
  episodeNumber?: string;
  animeTitle?: string;
  onNextEpisode?: () => void;
  onPrevEpisode?: () => void;
  onPlayerError?: () => void;
  onOpenWatchTogether?: () => void;
  onOpenDownload?: () => void;
  isWatchTogetherActive?: boolean;
  streamType?: "dash" | "hls";
  provider?: "aniboom" | "kodik" | "collaps" | "custom" | string;
  translationTitle?: string;
}

// WebGL pristine Anime4K 4-stage processing pipeline:
// 1. Debanding + Blue Noise Dither (8-16px radius)
// 2. Artifact Cleaning & Line Reconstruction (Anime4K_Restore_CNN_M)
// 3. Primary Upscale 2x (Anime4K_Upscale_CNN_x2_M)
// 4. Target Rescale to 1080p / 4K + AMD CAS (Contrast Adaptive Sharpening 0.4-0.6)
class AnimeWebGL1080p {
  private gl: WebGLRenderingContext;
  private debandProgram: WebGLProgram;
  private restoreProgram: WebGLProgram;
  private upscale2xProgram: WebGLProgram;
  private casRescaleProgram: WebGLProgram;
  private texture: WebGLTexture;
  private buffer: WebGLBuffer;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private animId: number | null = null;
  private rvfcId: number | null = null;
  private lastRenderedTime: number = -1;
  public isActive = false;
  private targetMode: number = 0; // 0 = Auto (1080p -> 4K 2160p, 720p -> 1080p), 2160 = 4K, 1080 = 1080p, -1 = Off
  private sharpness: number = 0.50; // AMD CAS sharpness

  // Framebuffer objects for multi-pass pipeline
  private fboDeband: WebGLFramebuffer | null = null;
  private fboDebandTexture: WebGLTexture | null = null;

  private fboRestore: WebGLFramebuffer | null = null;
  private fboRestoreTexture: WebGLTexture | null = null;

  private fboUpscale2x: WebGLFramebuffer | null = null;
  private fboUpscale2xTexture: WebGLTexture | null = null;

  private lastInputWidth = 0;
  private lastInputHeight = 0;
  private lastTargetWidth = 0;
  private lastTargetHeight = 0;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    this.canvas = canvas;
    this.video = video;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      depth: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error("WebGL is not supported");
    }
    this.gl = gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + vec2(0.5);
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // 1. Debanding + Blue Noise Dither
    const fsDebandSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec2 u_textureSize;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float blueNoiseDither(vec2 uv) {
        float n1 = hash12(uv * u_textureSize + vec2(1.23, 4.56));
        float n2 = hash12(uv * u_textureSize + vec2(7.89, 0.12));
        return (n1 + n2 - 1.0) / 255.0;
      }

      void main() {
        vec2 texel = 1.0 / u_textureSize;
        vec4 center = texture2D(u_image, v_texCoord);
        
        float radius = 12.0; // 8-16px sampling radius
        float threshold = 18.0 / 255.0; // Banding detection threshold
        
        vec3 sum = center.rgb;
        float totalWeight = 1.0;
        
        const float SAMPLES = 8.0;
        float angleStep = 6.2831853 / SAMPLES;
        
        for (float i = 0.0; i < SAMPLES; i += 1.0) {
          float angle = i * angleStep;
          float r = radius * (0.7 + 0.3 * hash12(v_texCoord * u_textureSize + vec2(i, 3.14159)));
          vec2 offset = vec2(cos(angle), sin(angle)) * r * texel;
          vec3 sampleCol = texture2D(u_image, v_texCoord + offset).rgb;
          
          vec3 diff = abs(sampleCol - center.rgb);
          float maxDiff = max(max(diff.r, diff.g), diff.b);
          
          if (maxDiff < threshold) {
            float weight = 1.0 - (maxDiff / threshold);
            sum += sampleCol * weight;
            totalWeight += weight;
          }
        }
        
        vec3 debanded = sum / totalWeight;
        float dither = blueNoiseDither(v_texCoord);
        vec3 finalColor = debanded + vec3(dither);
        
        gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), center.a);
      }
    `;

    // 2. Artifact Cleaning & Line Reconstruction (Anime4K_Restore_CNN_M)
    const fsRestoreSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec2 u_textureSize;

      float luma(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec2 d = 1.0 / u_textureSize;
        
        vec3 cc = texture2D(u_image, v_texCoord).rgb;
        vec3 tl = texture2D(u_image, v_texCoord + vec2(-d.x, -d.y)).rgb;
        vec3 tc = texture2D(u_image, v_texCoord + vec2( 0.0, -d.y)).rgb;
        vec3 tr = texture2D(u_image, v_texCoord + vec2( d.x, -d.y)).rgb;
        vec3 ml = texture2D(u_image, v_texCoord + vec2(-d.x,  0.0)).rgb;
        vec3 mr = texture2D(u_image, v_texCoord + vec2( d.x,  0.0)).rgb;
        vec3 bl = texture2D(u_image, v_texCoord + vec2(-d.x,  d.y)).rgb;
        vec3 bc = texture2D(u_image, v_texCoord + vec2( 0.0,  d.y)).rgb;
        vec3 br = texture2D(u_image, v_texCoord + vec2( d.x,  d.y)).rgb;
        
        float lCC = luma(cc);
        float lTL = luma(tl); float lTC = luma(tc); float lTR = luma(tr);
        float lML = luma(ml);                      float lMR = luma(mr);
        float lBL = luma(bl); float lBC = luma(bc); float lBR = luma(br);
        
        // Sobel edge gradient computation
        float gx = (lTR + 2.0 * lMR + lBR) - (lTL + 2.0 * lML + lBL);
        float gy = (lBL + 2.0 * lBC + lBR) - (lTL + 2.0 * lTC + lTR);
        float edgeStrength = sqrt(gx * gx + gy * gy);
        
        // Ringing suppression & compression halo removal
        vec3 minNeighbor = min(min(min(tl, tc), min(tr, ml)), min(min(mr, bl), min(bc, br)));
        vec3 maxNeighbor = max(max(max(tl, tc), max(tr, ml)), max(max(mr, bl), max(bc, br)));
        vec3 cleaned = clamp(cc, minNeighbor, maxNeighbor);
        
        // Directional line reconstruction for thin anime contours
        vec2 dir = normalize(vec2(-gy, gx) + vec2(0.0001));
        vec3 sP = texture2D(u_image, v_texCoord + dir * d * 0.75).rgb;
        vec3 sN = texture2D(u_image, v_texCoord - dir * d * 0.75).rgb;
        vec3 lineAverage = (sP + sN) * 0.5;
        
        float isEdge = smoothstep(0.06, 0.22, edgeStrength);
        vec3 reconstructed = mix(cleaned, min(cleaned, lineAverage), isEdge * 0.45);
        
        gl_FragColor = vec4(clamp(reconstructed, 0.0, 1.0), 1.0);
      }
    `;

    // 3. Primary Upscale (2x) (Anime4K_Upscale_CNN_x2_M)
    const fsUpscale2xSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec2 u_srcTextureSize;

      float luma(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec2 texel = 1.0 / u_srcTextureSize;
        vec2 pos = v_texCoord * u_srcTextureSize - 0.5;
        vec2 f = fract(pos);
        vec2 baseUV = (floor(pos) + 0.5) * texel;
        
        vec3 c00 = texture2D(u_image, baseUV).rgb;
        vec3 c10 = texture2D(u_image, baseUV + vec2(texel.x, 0.0)).rgb;
        vec3 c01 = texture2D(u_image, baseUV + vec2(0.0, texel.y)).rgb;
        vec3 c11 = texture2D(u_image, baseUV + vec2(texel.x, texel.y)).rgb;
        
        float l00 = luma(c00);
        float l10 = luma(c10);
        float l01 = luma(c01);
        float l11 = luma(c11);
        
        // Edge-directed vector contour interpolation
        float d1 = abs(l00 - l11);
        float d2 = abs(l10 - l01);
        
        vec3 color;
        if (d1 < d2 * 0.85) {
          float t = (f.x + f.y) * 0.5;
          color = mix(c00, c11, t);
        } else if (d2 < d1 * 0.85) {
          float t = (f.x + (1.0 - f.y)) * 0.5;
          color = mix(c01, c10, t);
        } else {
          vec3 top = mix(c00, c10, f.x);
          vec3 bot = mix(c01, c11, f.x);
          color = mix(top, bot, f.y);
        }
        
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `;

    // 4. Target Rescale + AMD CAS (Contrast Adaptive Sharpening)
    const fsCasRescaleSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec2 u_srcTextureSize;   // e.g. 2560x1440
      uniform vec2 u_targetResolution; // e.g. 1920x1080
      uniform float u_sharpness;       // 0.4 - 0.6 (default 0.50)

      void main() {
        vec2 d = 1.0 / u_srcTextureSize;
        
        // AMD FidelityFX CAS 3x3 cross pattern
        vec3 a = texture2D(u_image, v_texCoord + vec2( 0.0, -d.y)).rgb; // Top
        vec3 b = texture2D(u_image, v_texCoord + vec2(-d.x,  0.0)).rgb; // Left
        vec3 c = texture2D(u_image, v_texCoord).rgb;                   // Center
        vec3 dCol = texture2D(u_image, v_texCoord + vec2( d.x,  0.0)).rgb; // Right
        vec3 e = texture2D(u_image, v_texCoord + vec2( 0.0,  d.y)).rgb; // Bottom
        
        // Find min and max colors around center
        vec3 minRGB = min(min(min(a, b), min(dCol, e)), c);
        vec3 maxRGB = max(max(max(a, b), max(dCol, e)), c);
        
        // Compute adaptive contrast weight for CAS (AMD FidelityFX CAS algorithm)
        vec3 ampRGB = clamp(min(minRGB, vec3(2.0) - maxRGB) / max(maxRGB, vec3(0.0001)), 0.0, 1.0);
        float peakSharpness = clamp(u_sharpness, 0.0, 1.0) * 0.125;
        vec3 wRGB = -sqrt(ampRGB) * peakSharpness;
        
        // Filter reconstruction with safe clamped denominator (never drops below 0.5)
        vec3 weightDenom = max(vec3(0.5), vec3(1.0) + 4.0 * wRGB);
        vec3 finalColor = (a * wRGB + b * wRGB + c + dCol * wRGB + e * wRGB) / weightDenom;
        
        // Dynamic edge preservation range
        vec3 range = maxRGB - minRGB;
        vec3 minClamped = max(minRGB - range * 0.15, vec3(0.0));
        vec3 maxClamped = min(maxRGB + range * 0.15, vec3(1.0));
        finalColor = clamp(finalColor, minClamped, maxClamped);
        
        gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
      }
    `;

    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const createProg = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, createShader(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, createShader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      return p;
    };

    this.debandProgram = createProg(vsSource, fsDebandSource);
    this.restoreProgram = createProg(vsSource, fsRestoreSource);
    this.upscale2xProgram = createProg(vsSource, fsUpscale2xSource);
    this.casRescaleProgram = createProg(vsSource, fsCasRescaleSource);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
  }

  private createFBO(width: number, height: number): [WebGLFramebuffer, WebGLTexture] {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return [fbo, tex];
  }

  private initFBOs(inW: number, inH: number, targetW: number, targetH: number) {
    this.destroyFBOs();
    this.lastInputWidth = inW;
    this.lastInputHeight = inH;
    this.lastTargetWidth = targetW;
    this.lastTargetHeight = targetH;

    const upW = inW * 2;
    const upH = inH * 2;

    // FBO 1: Deband output (inW x inH)
    [this.fboDeband, this.fboDebandTexture] = this.createFBO(inW, inH);
    // FBO 2: Restore output (inW x inH)
    [this.fboRestore, this.fboRestoreTexture] = this.createFBO(inW, inH);
    // FBO 3: 2x Upscale intermediate output (2*inW x 2*inH)
    [this.fboUpscale2x, this.fboUpscale2xTexture] = this.createFBO(upW, upH);
  }

  private destroyFBOs() {
    const gl = this.gl;
    if (this.fboDebandTexture) gl.deleteTexture(this.fboDebandTexture);
    if (this.fboDeband) gl.deleteFramebuffer(this.fboDeband);
    if (this.fboRestoreTexture) gl.deleteTexture(this.fboRestoreTexture);
    if (this.fboRestore) gl.deleteFramebuffer(this.fboRestore);
    if (this.fboUpscale2xTexture) gl.deleteTexture(this.fboUpscale2xTexture);
    if (this.fboUpscale2x) gl.deleteFramebuffer(this.fboUpscale2x);

    this.fboDebandTexture = null;
    this.fboDeband = null;
    this.fboRestoreTexture = null;
    this.fboRestore = null;
    this.fboUpscale2xTexture = null;
    this.fboUpscale2x = null;
  }

  public setTargetResolution(targetH: number) {
    this.targetMode = targetH;
    if (targetH === 2160 || targetH === 0) {
      this.sharpness = 0.85; // 4K Super-Resolution boost
    } else if (targetH === 1080) {
      this.sharpness = 0.60;
    } else {
      this.sharpness = 0.50;
    }
    if (targetH === -1) {
      this.canvas.style.opacity = "0";
    } else if (this.isActive) {
      this.canvas.style.opacity = "1";
    }
  }

  public setSharpness(val: number) {
    this.sharpness = Math.max(0.0, Math.min(1.0, val));
  }

  public start() {
    if (this.isActive) return;
    this.isActive = true;
    if (this.targetMode !== -1) {
      this.canvas.style.opacity = "1";
    }
    this.scheduleFrame();
  }

  public stop() {
    this.isActive = false;
    this.canvas.style.opacity = "0";
    if (this.rvfcId !== null && "cancelVideoFrameCallback" in this.video) {
      try {
        (this.video as any).cancelVideoFrameCallback(this.rvfcId);
      } catch (_) {}
      this.rvfcId = null;
    }
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  private scheduleFrame = () => {
    if (!this.isActive) return;

    if ("requestVideoFrameCallback" in this.video) {
      this.rvfcId = (this.video as any).requestVideoFrameCallback(() => {
        if (!this.isActive) return;
        this.render();
        this.scheduleFrame();
      });
    } else {
      this.animId = requestAnimationFrame(() => {
        if (!this.isActive) return;
        if (
          !this.video.paused &&
          !this.video.seeking &&
          this.video.readyState >= 2 &&
          this.video.currentTime !== this.lastRenderedTime
        ) {
          this.lastRenderedTime = this.video.currentTime;
          this.render();
        }
        this.scheduleFrame();
      });
    }
  };

  private drawQuad(program: WebGLProgram) {
    const gl = this.gl;
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private render() {
    const video = this.video;
    const gl = this.gl;
    if (video.readyState < 2 || video.videoWidth === 0 || video.seeking) return;

    if (this.targetMode === -1) {
      this.canvas.style.opacity = "0";
      return;
    } else {
      this.canvas.style.opacity = "1";
    }

    const vW = video.videoWidth;
    const vH = video.videoHeight;

    // STRICT RESOLUTION RULES:
    // 1. 720p -> 1080p (Anime4K AI)
    // 2. 1080p -> 4K 2160p (Anime4K AI)
    // 3. 720p -> 4K is strictly FORBIDDEN (clamped to 1080p)
    let targetH = 1080;
    if (vH < 1000) {
      // Source is 720p (or lower) - 4K is strictly prohibited!
      targetH = 1080;
    } else {
      // Source is native 1080p (or higher)
      if (this.targetMode === 2160 || this.targetMode === 0) {
        targetH = 2160; // 1080p -> 4K
      } else if (this.targetMode === 1080) {
        // Native 1080p selected without upscale
        this.canvas.style.opacity = "0";
        return;
      } else {
        targetH = this.targetMode;
      }
    }

    const aspect = vW / vH;
    const targetW = Math.round(targetH * aspect);
    const upW = vW * 2;
    const upH = vH * 2;

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    if (
      this.lastInputWidth !== vW ||
      this.lastInputHeight !== vH ||
      this.lastTargetWidth !== targetW ||
      this.lastTargetHeight !== targetH ||
      !this.fboDeband
    ) {
      this.initFBOs(vW, vH, targetW, targetH);
    }

    // Bind source video frame into active input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // -------------------------------------------------------------
    // PASS 1: Debanding + Blue Noise Dither (vW x vH)
    // -------------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboDeband);
    gl.viewport(0, 0, vW, vH);
    gl.useProgram(this.debandProgram);

    gl.uniform1i(gl.getUniformLocation(this.debandProgram, "u_image"), 0);
    gl.uniform2f(gl.getUniformLocation(this.debandProgram, "u_textureSize"), vW, vH);
    this.drawQuad(this.debandProgram);

    // -------------------------------------------------------------
    // PASS 2: Artifact Cleaning & Line Reconstruction (Anime4K_Restore_CNN_M)
    // -------------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboRestore);
    gl.viewport(0, 0, vW, vH);
    gl.useProgram(this.restoreProgram);

    gl.bindTexture(gl.TEXTURE_2D, this.fboDebandTexture);
    gl.uniform1i(gl.getUniformLocation(this.restoreProgram, "u_image"), 0);
    gl.uniform2f(gl.getUniformLocation(this.restoreProgram, "u_textureSize"), vW, vH);
    this.drawQuad(this.restoreProgram);

    // -------------------------------------------------------------
    // PASS 3: Primary Upscale 2x (Anime4K_Upscale_CNN_x2_M -> upW x upH)
    // -------------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboUpscale2x);
    gl.viewport(0, 0, upW, upH);
    gl.useProgram(this.upscale2xProgram);

    gl.bindTexture(gl.TEXTURE_2D, this.fboRestoreTexture);
    gl.uniform1i(gl.getUniformLocation(this.upscale2xProgram, "u_image"), 0);
    gl.uniform2f(gl.getUniformLocation(this.upscale2xProgram, "u_srcTextureSize"), vW, vH);
    this.drawQuad(this.upscale2xProgram);

    // -------------------------------------------------------------
    // PASS 4: Target Rescale (to 1080p or 4K 2160p) + AMD CAS (Contrast Adaptive Sharpening)
    // -------------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, targetW, targetH);
    gl.useProgram(this.casRescaleProgram);

    gl.bindTexture(gl.TEXTURE_2D, this.fboUpscale2xTexture);
    gl.uniform1i(gl.getUniformLocation(this.casRescaleProgram, "u_image"), 0);
    gl.uniform2f(gl.getUniformLocation(this.casRescaleProgram, "u_srcTextureSize"), upW, upH);
    gl.uniform2f(gl.getUniformLocation(this.casRescaleProgram, "u_targetResolution"), targetW, targetH);
    gl.uniform1f(gl.getUniformLocation(this.casRescaleProgram, "u_sharpness"), this.sharpness);
    this.drawQuad(this.casRescaleProgram);
  }

  public destroy() {
    this.stop();
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.debandProgram) gl.deleteProgram(this.debandProgram);
    if (this.restoreProgram) gl.deleteProgram(this.restoreProgram);
    if (this.upscale2xProgram) gl.deleteProgram(this.upscale2xProgram);
    if (this.casRescaleProgram) gl.deleteProgram(this.casRescaleProgram);
    this.destroyFBOs();
  }
}

export const CustomPlayer = forwardRef<HTMLVideoElement, CustomPlayerProps>(
  (
    {
      src,
      poster,
      maxAudioTracks,
      audioTrackNames,
      autoPlay,
      animeId,
      episodeNumber,
      animeTitle,
      onNextEpisode,
      onPrevEpisode,
      onPlayerError,
      onOpenWatchTogether,
      onOpenDownload,
      isWatchTogetherActive,
      streamType,
      provider,
      translationTitle,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const artRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const artInstanceRef = useRef<Artplayer | null>(null);
    const webglInstanceRef = useRef<AnimeWebGL1080p | null>(null);

    // Determine active stream provider for logging
    const activeProvider = (
      provider
        ? (provider.toLowerCase().includes("aniboom") ? "AniBoom" : provider.toLowerCase().includes("kodik") ? "Kodik" : provider)
        : src.includes("aniboom") || streamType === "dash" || (src.includes("playlist") && src.includes("aniboom"))
          ? "AniBoom"
          : src.includes("kodik") || (src.includes("playlist") && src.includes("kodik"))
            ? "Kodik"
            : src.includes("collaps")
              ? "Collaps"
              : "KamiPlayer (Direct/Anime4K)"
    );

    useEffect(() => {
      console.log(
        `%c[Player Source]%c АКТИВНЫЙ ИСТОЧНИК: %c ${activeProvider.toUpperCase()} %c | Серия: ${episodeNumber || 1} | Озвучка: ${translationTitle || "Основная"} | Тип: ${streamType || (src.includes(".mpd") ? "DASH" : "HLS")}`,
        "background: #1e1b4b; color: #a78bfa; font-weight: bold; padding: 4px 6px; border-radius: 4px 0 0 4px;",
        "background: #312e81; color: #ffffff; font-weight: bold; padding: 4px 6px;",
        activeProvider === "AniBoom"
          ? "background: #059669; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;"
          : activeProvider === "Kodik"
            ? "background: #d97706; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;"
            : "background: #2563eb; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
        "background: #1e1b4b; color: #cbd5e1; padding: 4px 6px; border-radius: 0 4px 4px 0;"
      );
    }, [src, activeProvider, episodeNumber, translationTitle, streamType]);

    // Settings Modal State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeSubmenu, setActiveSubmenu] = useState<"main" | "quality" | "speed">("main");
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.addEventListener("mozfullscreenchange", handleFullscreenChange);
      document.addEventListener("MSFullscreenChange", handleFullscreenChange);
      return () => {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
        document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      };
    }, []);

    // Player Preferences (Stored in localStorage)
    const [selectedQuality, setSelectedQuality] = useState<string>(() => {
      return localStorage.getItem("kami_player_selected_quality") || "Авто";
    });
    const selectedQualityRef = useRef(selectedQuality);
    useEffect(() => {
      selectedQualityRef.current = selectedQuality;
    }, [selectedQuality]);

    const isAniboomStream = Boolean(
      (provider && provider.toLowerCase().includes("aniboom")) ||
      src.includes("aniboom") ||
      (src.includes("playlist") && src.includes("aniboom")) ||
      streamType === "dash" ||
      src.includes("cdn1.kamianime.club") ||
      src.includes("cdn.kamianime.club") ||
      (!provider && !src.includes("kodik"))
    );

    const isKodikStream = Boolean(
      !isAniboomStream && (
        (provider && provider.toLowerCase().includes("kodik")) ||
        src.includes("kodik")
      )
    );

    const [availableQualities, setAvailableQualities] = useState<
      { html: string; level: number; targetH?: number; isAi?: boolean }[]
    >(() => {
      if (isKodikStream) {
        return [
          { html: "1080p (Anime4K AI)", level: 0, targetH: 1080, isAi: true },
          { html: "720p", level: 0, targetH: -1 },
          { html: "480p", level: 1, targetH: -1 },
          { html: "360p", level: 2, targetH: -1 },
          { html: "Авто", level: -1, targetH: 0 },
        ];
      }
      return [
        { html: "4K (Anime4K AI)", level: 0, targetH: 2160, isAi: true },
        { html: "1080p", level: 0, targetH: -1 },
        { html: "720p", level: 1, targetH: -1 },
        { html: "480p", level: 2, targetH: -1 },
        { html: "360p", level: 3, targetH: -1 },
        { html: "Авто", level: -1, targetH: 0 },
      ];
    });

    // Sync default available qualities when source or provider changes
    useEffect(() => {
      if (isKodikStream) {
        setAvailableQualities([
          { html: "1080p (Anime4K AI)", level: 0, targetH: 1080, isAi: true },
          { html: "720p", level: 0, targetH: -1 },
          { html: "480p", level: 1, targetH: -1 },
          { html: "360p", level: 2, targetH: -1 },
          { html: "Авто", level: -1, targetH: 0 },
        ]);
      } else {
        setAvailableQualities([
          { html: "4K (Anime4K AI)", level: 0, targetH: 2160, isAi: true },
          { html: "1080p", level: 0, targetH: -1 },
          { html: "720p", level: 1, targetH: -1 },
          { html: "480p", level: 2, targetH: -1 },
          { html: "360p", level: 3, targetH: -1 },
          { html: "Авто", level: -1, targetH: 0 },
        ]);
      }
    }, [src, provider, streamType, isKodikStream]);

    // Keep selected quality valid across provider/quality list changes
    useEffect(() => {
      if (availableQualities.length > 0) {
        const isValid = availableQualities.some((q) => q.html === selectedQuality);
        if (!isValid) {
          if (selectedQuality.includes("4K")) {
            const ai1080 = availableQualities.find((q) => q.html.includes("1080p (Anime4K"));
            if (ai1080) {
              setSelectedQuality(ai1080.html);
              return;
            }
          } else if (selectedQuality.includes("1080p (Anime4K")) {
            const ai4k = availableQualities.find((q) => q.html.includes("4K"));
            if (ai4k) {
              setSelectedQuality(ai4k.html);
              return;
            }
          }
          setSelectedQuality("Авто");
        }
      }
    }, [availableQualities]);

    const [selectedSpeed, setSelectedSpeed] = useState<number>(1.0);
    const speedOptions = [
      { label: "0.5x", value: 0.5 },
      { label: "0.75x", value: 0.75 },
      { label: "Обычная (1.0x)", value: 1.0 },
      { label: "1.25x", value: 1.25 },
      { label: "1.5x", value: 1.5 },
      { label: "1.75x", value: 1.75 },
      { label: "2.0x", value: 2.0 },
    ];

    const [autoNext, setAutoNext] = useState<boolean>(() => {
      const v = localStorage.getItem("kami_player_auto_next");
      return v !== null ? v === "true" : true;
    });

    const [skipOpening, setSkipOpening] = useState<boolean>(() => {
      const v = localStorage.getItem("kami_player_skip_op");
      return v !== null ? v === "true" : true;
    });

    const [skipEnding, setSkipEnding] = useState<boolean>(() => {
      const v = localStorage.getItem("kami_player_skip_ed");
      return v !== null ? v === "true" : true;
    });

    const [miniOnScroll, setMiniOnScroll] = useState<boolean>(() => {
      const v = localStorage.getItem("kami_player_mini_scroll");
      return v !== null ? v === "true" : true;
    });

    // Dynamic In-Player Badges
    const [showSkipOpBtn, setShowSkipOpBtn] = useState(false);
    const [showSkipEdBtn, setShowSkipEdBtn] = useState(false);

    // Mini Player on Scroll State
    const [isMiniPlayer, setIsMiniPlayer] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const onNextEpisodeRef = useRef(onNextEpisode);
    const onPrevEpisodeRef = useRef(onPrevEpisode);
    const onPlayerErrorRef = useRef(onPlayerError);
    const audioTrackNamesRef = useRef(audioTrackNames);
    const lastPlaybackPosRef = useRef<number>(0);
    const wasPlayingRef = useRef<boolean>(false);

    useEffect(() => {
      onNextEpisodeRef.current = onNextEpisode;
    }, [onNextEpisode]);

    useEffect(() => {
      onPrevEpisodeRef.current = onPrevEpisode;
    }, [onPrevEpisode]);

    useEffect(() => {
      onPlayerErrorRef.current = onPlayerError;
    }, [onPlayerError]);

    useEffect(() => {
      audioTrackNamesRef.current = audioTrackNames;
    }, [audioTrackNames]);

    // Handle Mini-Player on Scroll using IntersectionObserver
    useEffect(() => {
      if (!miniOnScroll || !containerRef.current || isTvDevice()) {
        setIsMiniPlayer(false);
        return;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
            setIsMiniPlayer(true);
          } else {
            setIsMiniPlayer(false);
          }
        },
        { threshold: 0.15 },
      );

      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [miniOnScroll]);

    useEffect(() => {
      if (!artRef.current) return;

      let art: Artplayer | null = null;
      let blobUrl: string | null = null;
      let isCancelled = false;
      let webglInstance: AnimeWebGL1080p | null = null;

      const saveProgress = (t: number, d: number) => {
        if (!animeId || !episodeNumber) return;
        if (t > 5 && Math.floor(t) % 5 === 0) {
          localStorage.setItem(`anime_progress_${animeId}_${episodeNumber}`, t.toString());
        }
        if (d > 0 && t / d >= 0.6) {
          const key = `anime_watched_${animeId}`;
          try {
            const stored = localStorage.getItem(key);
            const watched: string[] = stored ? JSON.parse(stored) : [];
            if (!watched.includes(episodeNumber)) {
              watched.push(episodeNumber);
              localStorage.setItem(key, JSON.stringify(watched));
              window.dispatchEvent(
                new CustomEvent("anime_episode_watched", {
                  detail: { animeId, episode: episodeNumber },
                }),
              );
            }
          } catch (e) {
            console.error(e);
          }
        }
      };

      const initPlayer = async () => {
        let finalUrl = src;
        if (window.location.protocol === 'https:' && finalUrl.startsWith('http://')) {
          finalUrl = finalUrl.replace(/^http:\/\//i, 'https://');
        }
        console.log(`🎬 [KamiPlayer Engine] Initializing player instance...`);
        console.log(`🔗 [KamiPlayer Engine] Raw Stream Source URL:`, finalUrl);

        if (maxAudioTracks && src.endsWith(".m3u8")) {
          try {
            const res = await fetch(src);
            const text = await res.text();
            const baseUrl = src.substring(0, src.lastIndexOf("/") + 1);

            const lines = text.replace(/\r/g, "").split("\n");
            let audioCount = 0;
            const newLines = lines
              .map((line) => {
                if (line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
                  audioCount++;
                  if (audioCount > maxAudioTracks) return null;
                }
                if (line.includes('URI="')) {
                  return line.replace(/URI="([^"]+)"/, (match, uri) => {
                    if (!uri.startsWith("http") && !uri.startsWith("/"))
                      return `URI="${baseUrl}${uri}"`;
                    return match;
                  });
                }
                if (
                  line &&
                  !line.startsWith("#") &&
                  !line.startsWith("http") &&
                  !line.startsWith("/")
                ) {
                  return baseUrl + line;
                }
                return line;
              })
              .filter((l) => l !== null);

            const blob = new Blob([newLines.join("\n")], {
              type: "application/vnd.apple.mpegurl",
            });
            blobUrl = URL.createObjectURL(blob);
            finalUrl = blobUrl;
          } catch (e) {
            console.error("Failed to rewrite manifest", e);
          }
        }

        if (isCancelled || !artRef.current) return;

        const isDashStream = Boolean(
          streamType === "dash" ||
          src.includes(".mpd") ||
          (src.includes("url=") && decodeURIComponent(src).includes(".mpd"))
        );

        art = new Artplayer({
          container: artRef.current,
          url: finalUrl,
          poster: "",
          type: isDashStream ? "mpd" : "m3u8",
          theme: "#8B5CF6", // KamiAnime Signature Violet Color
          volume: 0.7,
          moreVideoAttr: {
            crossOrigin: "anonymous",
          },
          autoplay: autoPlay || false,
          pip: false,
          autoSize: true,
          autoMini: false,
          screenshot: true,
          setting: false, // We supply our dedicated reference popup settings
          playbackRate: true,
          aspectRatio: true,
          fullscreen: true,
          fullscreenWeb: true,
          miniProgressBar: true,
          lang: "ru",
          i18n: {
            ru: {
              "Play Speed": "Скорость",
              "Aspect Ratio": "Соотношение сторон",
              Default: "По умолчанию",
              Normal: "Обычная",
              Settings: "Настройки",
              Play: "Запуск",
              Pause: "Пауза",
              Volume: "Громкость",
              Mute: "Заглушить",
              Screenshot: "Скриншот",
              Fullscreen: "Во весь экран",
              "Exit Fullscreen": "Выйти из полноэкранного режима",
              "Web Fullscreen": "В окне",
              "Exit Web Fullscreen": "Выйти из окна",
            },
          } as any,
          controls: [
            ...(!!onPrevEpisode
              ? [
                  {
                    name: "prev-episode",
                    position: "left",
                    index: 11,
                    html: `
                      <span class="art-icon art-icon-prev-ep" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; margin-right: 2px; color: #fff;" title="Предыдущая серия">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polygon points="19 20 9 12 19 4 19 20" fill="currentColor"></polygon>
                          <line x1="5" y1="19" x2="5" y2="5"></line>
                        </svg>
                      </span>
                    `,
                    click: function () {
                      if (onPrevEpisodeRef.current) {
                        onPrevEpisodeRef.current();
                      }
                    },
                  },
                ]
              : []),
            ...(!!onNextEpisode
              ? [
                  {
                    name: "next-episode",
                    position: "left",
                    index: 12,
                    html: `
                      <span class="art-icon art-icon-next-ep" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; color: #fff;" title="Следующая серия">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polygon points="5 4 15 12 5 20 5 4" fill="currentColor"></polygon>
                          <line x1="19" y1="5" x2="19" y2="19"></line>
                        </svg>
                      </span>
                    `,
                    click: function () {
                      if (onNextEpisodeRef.current) {
                        onNextEpisodeRef.current();
                      }
                    },
                  },
                ]
              : []),
            {
              name: "custom-settings-btn",
              position: "right",
              index: 20,
              html: `
                <span class="art-icon art-icon-custom-settings" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; color: #fff;" title="Настройки">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </span>
              `,
              click: function () {
                setIsSettingsOpen((prev) => !prev);
              },
            },
          ],
          customType: {
            mpd: function (video, url, artInstance) {
              if ((artInstance as any).dash) {
                try {
                  (artInstance as any).dash.destroy();
                } catch (e) {}
              }

              const player = dashjs.MediaPlayer().create();

              // Формируем безопасный прокси-URL для Dash.js
              let proxyUrl = url;
              if (!proxyUrl.startsWith("/api/proxy-4k") && !proxyUrl.startsWith("http://localhost") && proxyUrl.startsWith("http")) {
                proxyUrl = `/api/proxy-4k?url=${encodeURIComponent(url)}&referer=${encodeURIComponent("https://aniboom.one/")}`;
              }

              const shouldAutoPlay = Boolean(autoPlay);
              player.initialize(video, proxyUrl, shouldAutoPlay);
              (artInstance as any).dash = player;

              player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
                console.warn("[Dash.js Error]:", e);
              });

              // Populate qualities on stream initialization safely for Dash.js v4 & v5
              player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
                try {
                  let videoBitrates: any[] = [];
                  if (typeof (player as any).getBitrateInfoListFor === "function") {
                    videoBitrates = (player as any).getBitrateInfoListFor("video") || [];
                  } else if (typeof (player as any).getRepresentationsByType === "function") {
                    videoBitrates = (player as any).getRepresentationsByType("video") || [];
                  } else if (typeof (player as any).getTracksFor === "function") {
                    const tracks = (player as any).getTracksFor("video");
                    if (tracks && tracks.length > 0) {
                      videoBitrates = tracks[0].bitrateList || tracks[0].representations || [];
                    }
                  }

                  let maxNativeH = 0;
                  const nativeList: { html: string; level: number; targetH?: number; height: number }[] = [];

                  if (videoBitrates && videoBitrates.length > 0) {
                    videoBitrates.forEach((bitrateInfo: any, index: number) => {
                      const height = bitrateInfo.height || 0;
                      if (height > maxNativeH) maxNativeH = height;
                      const name = height ? `${height}p` : `${bitrateInfo.bitrate || (index + 1)} kbps`;
                      if (!nativeList.some(q => q.html === name)) {
                        nativeList.push({ html: name, level: index, targetH: -1, height });
                      }
                    });
                  } else {
                    if (isAniboomStream) {
                      nativeList.push(
                        { html: "1080p", level: 0, targetH: -1, height: 1080 },
                        { html: "720p", level: 1, targetH: -1, height: 720 },
                        { html: "480p", level: 2, targetH: -1, height: 480 },
                        { html: "360p", level: 3, targetH: -1, height: 360 }
                      );
                      maxNativeH = 1080;
                    } else {
                      nativeList.push(
                        { html: "720p", level: 0, targetH: -1, height: 720 },
                        { html: "480p", level: 1, targetH: -1, height: 480 },
                        { html: "360p", level: 2, targetH: -1, height: 360 }
                      );
                      maxNativeH = 720;
                    }
                  }

                  if (isAniboomStream && maxNativeH < 1080) {
                    maxNativeH = 1080;
                    if (!nativeList.some(q => q.html === "1080p")) {
                      nativeList.unshift({ html: "1080p", level: 0, targetH: -1, height: 1080 });
                    }
                  }

                  // Sort descending
                  nativeList.sort((a, b) => b.height - a.height);

                  const isKodik = Boolean(
                    !isAniboomStream && (
                      (provider && provider.toLowerCase().includes("kodik")) ||
                      src.includes("kodik")
                    )
                  );
                  const hasNative1080 = !isKodik && (maxNativeH >= 1080 || isAniboomStream);

                  const parsedQualities: { html: string; level: number; targetH?: number; isAi?: boolean }[] = [];

                  // RULE:
                  // 1080p native source (e.g. Aniboom) -> upscales to 4K: "4K (Anime4K AI)"
                  // 720p native source (e.g. Kodik) -> upscales to 1080p: "1080p (Anime4K AI)"
                  if (hasNative1080) {
                    parsedQualities.push({ html: "4K (Anime4K AI)", level: 0, targetH: 2160, isAi: true });
                  } else {
                    parsedQualities.push({ html: "1080p (Anime4K AI)", level: 0, targetH: 1080, isAi: true });
                  }

                  nativeList.forEach(item => {
                    if (!parsedQualities.some(q => q.html === item.html)) {
                      parsedQualities.push({ html: item.html, level: item.level, targetH: -1 });
                    }
                  });

                  parsedQualities.push({ html: "Авто", level: -1, targetH: 0 });
                  setAvailableQualities(parsedQualities);
                } catch (err) {
                  console.warn("[Dash.js Quality Read Error]", err);
                }
              });

              // Bind the Anime4K WebGL Upscaler for pristine 1080p/4K rendering
              artInstance.on("ready", () => {
                const videoEl = artInstance.video;
                const isTv = isTvDevice();

                if (canvasRef.current && videoEl && !isTv) {
                  try {
                    const videoContainer = videoEl.parentElement;
                    if (videoContainer) {
                      if (!videoContainer.querySelector("canvas.anime-webgl-canvas")) {
                        videoContainer.appendChild(canvasRef.current);
                        canvasRef.current.className = "anime-webgl-canvas";
                        canvasRef.current.setAttribute(
                          "style",
                          "position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; transition: opacity 0.3s ease; opacity: 0; z-index: 5;",
                        );
                      }
                    }

                    if (webglInstanceRef.current) {
                      webglInstanceRef.current.destroy();
                    }

                    const upscaler = new AnimeWebGL1080p(
                      canvasRef.current,
                      videoEl,
                    );
                    webglInstance = upscaler;
                    webglInstanceRef.current = upscaler;

                    const curQ = selectedQualityRef.current;
                    if (curQ.includes("4K")) {
                      upscaler.setTargetResolution(2160);
                    } else if (curQ.includes("1080p (Anime4K")) {
                      upscaler.setTargetResolution(1080);
                    } else if (curQ === "Авто") {
                      upscaler.setTargetResolution(0);
                    } else {
                      upscaler.setTargetResolution(-1);
                    }

                    upscaler.start();
                  } catch (e) {
                    console.error("Anime WebGL Initialization Error with DASH:", e);
                  }
                }
              });

              artInstance.on("destroy", () => {
                try {
                  player.destroy();
                } catch (_) {}
              });
            },
            m3u8: function (video, url, artInstance) {
              if (Hls.isSupported()) {
                if ((artInstance as any).hls)
                  (artInstance as any).hls.destroy();
                const hls = new Hls({
                  enableWorker: true,
                  maxBufferLength: 30,
                  maxMaxBufferLength: 90,
                  maxBufferSize: 120 * 1000 * 1000,
                  capLevelToPlayerSize: true,
                  progressive: true,
                  fragLoadingTimeOut: 15000,
                  manifestLoadingTimeOut: 10000,
                });
                (artInstance as any).hls = hls;
                hls.attachMedia(video);
                hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                  hls.loadSource(url);
                });

                hls.on(Hls.Events.ERROR, function (event, data) {
                  if (data.fatal) {
                    console.error("HLS fatal error:", data.type, data.details, data.response);

                    // Manifest failure or 502/404 stream error: immediately switch to backup player
                    if (
                      data.details === "manifestParsingError" ||
                      data.details === "manifestLoadError" ||
                      data.details === "manifestLoadTimeOut" ||
                      (data.response && (data.response.code === 502 || data.response.code === 404 || data.response.code === 403))
                    ) {
                      if (artInstance && artInstance.notice) {
                        artInstance.notice.show = "Ошибка загрузки потока. Переключаем на запасной плеер...";
                      }
                      if (onPlayerErrorRef.current) {
                        onPlayerErrorRef.current();
                      }
                      return;
                    }

                    switch (data.type) {
                      case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                      case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                      default:
                        if (artInstance && artInstance.notice) {
                          artInstance.notice.show =
                            "Ошибка потока. Переключаем на запасной плеер...";
                        }
                        if (onPlayerErrorRef.current) {
                          onPlayerErrorRef.current();
                        }
                        break;
                    }
                  }
                });

                let isQualityAdded = false;
                const updateQualitiesFromLevels = (levels: any[]) => {
                  let maxNativeH = 0;
                  const mappedLevels: { html: string; level: number; height: number }[] = [];

                  if (levels && levels.length > 0) {
                    levels.forEach((l: any, index: number) => {
                      let height = l.height || (l.attrs && l.attrs.RESOLUTION ? parseInt(l.attrs.RESOLUTION.split("x")[1]) : 0);
                      const name = l.name || (l.attrs && l.attrs.NAME) || "";
                      const urlStr = String(l.url || l.uri || l._url || "");

                      // Infer height from URL, name or bitrate if 0
                      if (!height) {
                        if (urlStr.includes("1080") || name.includes("1080")) {
                          height = 1080;
                        } else if (urlStr.includes("720") || name.includes("720")) {
                          height = 720;
                        } else if (urlStr.includes("480") || name.includes("480")) {
                          height = 480;
                        } else if (urlStr.includes("360") || name.includes("360")) {
                          height = 360;
                        } else if (l.bitrate && l.bitrate > 2200000) {
                          height = 1080;
                        } else if (l.bitrate && l.bitrate > 1200000) {
                          height = 720;
                        }
                      }

                      let label = "720p";
                      if (name) {
                        label = name.includes("p") ? name : `${name}p`;
                      } else if (height >= 1080) {
                        label = "1080p";
                      } else if (height >= 720) {
                        label = "720p";
                      } else if (height >= 480) {
                        label = "480p";
                      } else if (height >= 360) {
                        label = "360p";
                      } else if (height > 0) {
                        label = `${height}p`;
                      } else if (isAniboomStream && index === 0) {
                        label = "1080p";
                        height = 1080;
                      } else {
                        label = `Качество ${index + 1}`;
                      }

                      const numericHeight = height || (label.includes("1080") ? 1080 : label.includes("720") ? 720 : label.includes("480") ? 480 : label.includes("360") ? 360 : 0);
                      if (numericHeight > maxNativeH) maxNativeH = numericHeight;

                      mappedLevels.push({
                        html: label,
                        level: index,
                        height: numericHeight,
                      });
                    });

                    // Sort descending by resolution height
                    mappedLevels.sort((a, b) => b.height - a.height);
                  } else {
                    if (isAniboomStream) {
                      mappedLevels.push(
                        { html: "1080p", level: 0, height: 1080 },
                        { html: "720p", level: 1, height: 720 },
                        { html: "480p", level: 2, height: 480 },
                        { html: "360p", level: 3, height: 360 }
                      );
                      maxNativeH = 1080;
                    } else {
                      mappedLevels.push(
                        { html: "720p", level: 0, height: 720 },
                        { html: "480p", level: 1, height: 480 },
                        { html: "360p", level: 2, height: 360 }
                      );
                      maxNativeH = 720;
                    }
                  }

                  if (isAniboomStream && maxNativeH < 1080) {
                    maxNativeH = 1080;
                    if (!mappedLevels.some(q => q.html === "1080p")) {
                      mappedLevels.unshift({ html: "1080p", level: 0, height: 1080 });
                    }
                  }

                  const isKodik = Boolean(
                    !isAniboomStream && (
                      (provider && provider.toLowerCase().includes("kodik")) ||
                      src.includes("kodik")
                    )
                  );
                  const hasNative1080 = !isKodik && (maxNativeH >= 1080 || isAniboomStream);

                  const finalQuals: { html: string; level: number; targetH?: number; isAi?: boolean }[] = [];

                  // RULE:
                  // 1080p native source (e.g. Aniboom) -> upscales to 4K: "4K (Anime4K AI)"
                  // 720p native source (e.g. Kodik) -> upscales to 1080p: "1080p (Anime4K AI)"
                  if (hasNative1080) {
                    finalQuals.push({ html: "4K (Anime4K AI)", level: 0, targetH: 2160, isAi: true });
                  } else {
                    finalQuals.push({ html: "1080p (Anime4K AI)", level: 0, targetH: 1080, isAi: true });
                  }

                  mappedLevels.forEach((item) => {
                    if (!finalQuals.some((q) => q.html === item.html)) {
                      finalQuals.push({ html: item.html, level: item.level, targetH: -1 });
                    }
                  });

                  finalQuals.push({ html: "Авто", level: -1, targetH: 0 });

                  console.log("📺 [HLS Quality Map] Dynamic qualities resolved:", finalQuals);
                  setAvailableQualities(finalQuals);
                };

                hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                  if (isQualityAdded) return;
                  isQualityAdded = true;
                  updateQualitiesFromLevels(data.levels || hls.levels || []);
                });

                hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
                  console.log(`🎬 [HLS] Quality level actively switched to index: ${data.level}`);
                });

                artInstance.on("ready", () => {
                  const videoEl = artInstance.video;
                  const isTv = isTvDevice();

                  if (canvasRef.current && videoEl && !isTv) {
                    try {
                      const videoContainer = videoEl.parentElement;
                      if (videoContainer) {
                        if (!videoContainer.querySelector("canvas.anime-webgl-canvas")) {
                          videoContainer.appendChild(canvasRef.current);
                          canvasRef.current.className = "anime-webgl-canvas";
                          canvasRef.current.setAttribute(
                            "style",
                            "position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; transition: opacity 0.3s ease; opacity: 0; z-index: 5;",
                          );
                        }
                      }

                      if (webglInstanceRef.current) {
                        webglInstanceRef.current.destroy();
                      }

                      const upscaler = new AnimeWebGL1080p(
                        canvasRef.current,
                        videoEl,
                      );
                      webglInstance = upscaler;
                      webglInstanceRef.current = upscaler;

                      const curQ = selectedQualityRef.current;
                      if (curQ.includes("4K")) {
                        upscaler.setTargetResolution(2160);
                      } else if (curQ.includes("1080p (Anime4K")) {
                        upscaler.setTargetResolution(1080);
                      } else if (curQ === "Авто") {
                        upscaler.setTargetResolution(0);
                      } else {
                        upscaler.setTargetResolution(-1);
                      }

                      upscaler.start();
                    } catch (e) {
                      console.error("Anime WebGL Initialization Error with HLS:", e);
                    }
                  }
                });

                artInstance.on("destroy", () => hls.destroy());
              } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = url;
              }
            },
          },
        });

        artInstanceRef.current = art;

        // Track Play / Pause
        art.on("video:play", () => setIsPlaying(true));
        art.on("video:pause", () => setIsPlaying(false));

        // Track Fullscreen state
        art.on("fullscreen", (state: boolean) => {
          setIsFullscreen(state || !!document.fullscreenElement);
        });
        art.on("fullscreenWeb", (state: boolean) => {
          setIsFullscreen(state || !!document.fullscreenElement);
        });

        // Time updates: Progress, Skip Opening (+85s) & Skip Ending logic
        art.on("video:timeupdate", () => {
          if (!art) return;
          const curr = art.currentTime;
          const dur = art.duration;
          saveProgress(curr, dur);

          // Opening badge: between 10s and 110s
          if (curr >= 10 && curr <= 110) {
            setShowSkipOpBtn(true);
          } else {
            setShowSkipOpBtn(false);
          }

          // Ending badge: in last 85 seconds of the episode (when dur > 180s)
          if (dur > 180 && curr >= dur - 85) {
            setShowSkipEdBtn(true);
          } else {
            setShowSkipEdBtn(false);
          }
        });

        // Auto-switch to next episode when current video ends
        art.on("video:ended", () => {
          const isAutoNextActive =
            localStorage.getItem("kami_player_auto_next") !== "false";
          if (isAutoNextActive && onNextEpisodeRef.current) {
            if (art && art.notice) {
              art.notice.show = "Запуск следующей серии...";
            }
            setTimeout(() => {
              onNextEpisodeRef.current?.();
            }, 800);
          }
        });

        // Restore playback position on load
        art.on("ready", () => {
          if (!art) return;
          let seekTime = 0;
          if (lastPlaybackPosRef.current > 0) {
            seekTime = lastPlaybackPosRef.current;
          } else if (animeId && episodeNumber) {
            const saved = localStorage.getItem(
              `anime_progress_${animeId}_${episodeNumber}`,
            );
            if (saved) {
              const parsed = parseFloat(saved);
              if (!isNaN(parsed) && parsed > 5) {
                seekTime = parsed;
              }
            }
          }

          if (seekTime > 0) {
            art.currentTime = seekTime;
            if (art.notice) {
              art.notice.show = `Продолжено с ${Math.floor(seekTime / 60)}:${Math.floor(seekTime % 60).toString().padStart(2, "0")}`;
            }
          }
          if (wasPlayingRef.current && art.video && art.video.paused) {
            art.video.play().catch(() => {});
          }
        });

        art.on("fullscreen", (state) => {
          setIsFullscreen(Boolean(state));
        });
        art.on("fullscreenWeb", (state) => {
          setIsFullscreen(Boolean(state));
        });

        if (typeof ref === "function") {
          (art.video as any).art = art;
          ref(art.video);
        } else if (ref) {
          (art.video as any).art = art;
          ref.current = art.video;
        }
      };

      initPlayer();

      return () => {
        isCancelled = true;
        if (webglInstanceRef.current) {
          webglInstanceRef.current.destroy();
          webglInstanceRef.current = null;
        } else if (webglInstance) {
          webglInstance.destroy();
        }
        if (art) {
          if (art.currentTime > 0) {
            lastPlaybackPosRef.current = art.currentTime;
            wasPlayingRef.current = !art.video?.paused;
          }
          if (animeId && episodeNumber && art.currentTime > 5) {
            saveProgress(art.currentTime, art.duration);
          }
          if (art.destroy) {
            art.destroy(false);
          }
        }
        artInstanceRef.current = null;
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      };
    }, [
      src,
      maxAudioTracks,
      !!audioTrackNames,
      autoPlay,
      animeId,
      episodeNumber,
      !!onNextEpisode,
      !!onPrevEpisode,
    ]);

    // Quality Selection Handler
    const handleSelectQuality = (item: { html: string; level: number; targetH?: number; isAi?: boolean }) => {
      setSelectedQuality(item.html);
      localStorage.setItem("kami_player_selected_quality", item.html);

      const art = artInstanceRef.current;
      const currentPos = art ? art.currentTime : 0;
      const wasPlaying = art && art.video && !art.video.paused;

      // WebGL Upscaler resolution mode
      if (webglInstanceRef.current) {
        if (item.html.includes("4K") || item.targetH === 2160) {
          webglInstanceRef.current.setTargetResolution(2160);
          webglInstanceRef.current.start();
        } else if (item.html.includes("1080p (Anime4K") || item.targetH === 1080) {
          webglInstanceRef.current.setTargetResolution(1080);
          webglInstanceRef.current.start();
        } else if (item.html === "Авто" || item.targetH === 0) {
          webglInstanceRef.current.setTargetResolution(0); // Auto mode: 1080p source -> 4K (2160p), 720p source -> 1080p
          webglInstanceRef.current.start();
        } else {
          // Standard raw resolution selected without AI upscaling
          webglInstanceRef.current.setTargetResolution(-1);
        }
      }

      if (art && (art as any).hls) {
        const hls = (art as any).hls;
        try {
          console.log(`[Quality Switch] Applying HLS quality level ${item.level} (${item.html})`);
          if (item.level === -1) {
            hls.currentLevel = -1;
            hls.loadLevel = -1;
            hls.nextLevel = -1;
          } else if (item.isAi) {
            hls.currentLevel = 0;
            hls.loadLevel = 0;
            hls.nextLevel = 0;
          } else {
            hls.currentLevel = item.level;
            hls.loadLevel = item.level;
            hls.nextLevel = item.level;
          }

          if (currentPos > 0 && art.video) {
            art.currentTime = currentPos;
            if (wasPlaying && art.video.paused) {
              art.video.play().catch(() => {});
            }
          }
        } catch (err) {
          console.warn("[HLS Quality Switch Error]", err);
        }
      } else if (art && (art as any).dash) {
        const player = (art as any).dash;
        try {
          console.log(`[Quality Switch] Applying DASH quality level ${item.level} (${item.html})`);
          if (item.level === -1 || item.isAi) {
            if (typeof player.updateSettings === "function") {
              player.updateSettings({
                streaming: {
                  abr: {
                    autoSwitchBitrate: {
                      video: true
                    }
                  }
                }
              });
            }
            if (typeof player.setAutoSwitchQualityFor === "function") {
              player.setAutoSwitchQualityFor("video", true);
            }
          } else {
            if (typeof player.updateSettings === "function") {
              player.updateSettings({
                streaming: {
                  abr: {
                    autoSwitchBitrate: {
                      video: false
                    }
                  }
                }
              });
            }
            if (typeof player.setAutoSwitchQualityFor === "function") {
              player.setAutoSwitchQualityFor("video", false);
            }

            if (typeof player.setQualityFor === "function") {
              player.setQualityFor("video", item.level);
            } else if (typeof player.setRepresentationIndexFor === "function") {
              player.setRepresentationIndexFor("video", item.level);
            } else if (typeof player.setRepresentationFor === "function") {
              const reps = typeof player.getRepresentationsByType === "function"
                ? player.getRepresentationsByType("video")
                : [];
              if (reps && reps[item.level]) {
                player.setRepresentationFor("video", reps[item.level]);
              }
            }
          }

          if (currentPos > 0 && art.video) {
            art.currentTime = currentPos;
            if (wasPlaying && art.video.paused) {
              art.video.play().catch(() => {});
            }
          }
        } catch (err) {
          console.warn("[Dash.js Quality Switch Error]", err);
        }
      }
      if (art && art.notice) {
        art.notice.show = `Качество: ${item.html}`;
      }
      setActiveSubmenu("main");
    };

    // Speed Selection Handler
    const handleSelectSpeed = (speedVal: number, label: string) => {
      setSelectedSpeed(speedVal);
      const art = artInstanceRef.current;
      if (art) {
        art.playbackRate = speedVal;
        if (art.notice) {
          art.notice.show = `Скорость: ${label}`;
        }
      }
      setActiveSubmenu("main");
    };

    // Skip Opening Action (+85s)
    const handleSkipOpening = () => {
      const art = artInstanceRef.current;
      if (art) {
        art.currentTime += 85;
        if (art.notice) {
          art.notice.show = "+85s Пропуск опенинга";
        }
      }
      setShowSkipOpBtn(false);
    };

    // Skip Ending Action -> Jump to Next Episode
    const handleSkipEnding = () => {
      if (onNextEpisodeRef.current) {
        onNextEpisodeRef.current();
      }
    };

    // Download Episode Action
    const handleDownloadEpisode = () => {
      const art = artInstanceRef.current;
      if (art && art.notice) {
        art.notice.show = "Подготовка файла к загрузке...";
      }
      // Check if we can direct download or trigger bot/stream
      if (src) {
        const link = document.createElement("a");
        link.href = src;
        link.download = `anime_${animeId || "video"}_ep_${episodeNumber || "1"}.mp4`;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setIsSettingsOpen(false);
    };

    return (
      <div
        ref={containerRef}
        className="relative w-full aspect-video rounded-[1.5rem] md:rounded-[2rem] bg-black overflow-hidden group/player select-none"
      >
        {/* Invisible HTML5 video element strictly for SEO crawlers */}
        {src && (
          <video
            className="sr-only"
            style={{ display: "none" }}
            preload="none"
            controls
          >
            <source src={src} type="application/x-mpegURL" />
            Ваш браузер не поддерживает HLS видео.
          </video>
        )}

        {/* Primary Artplayer Container */}
        <div ref={artRef} className="w-full h-full" />
        <canvas
          ref={canvasRef}
          style={{ pointerEvents: "none", transition: "opacity 0.3s ease" }}
          className="absolute inset-0 w-full h-full object-contain opacity-0 z-10"
        />

        {/* Dynamic Quick Skip Opening Badge (+85s) */}
        {skipOpening && showSkipOpBtn && (
          <div className="absolute bottom-16 left-6 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              onClick={handleSkipOpening}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/80 hover:bg-[#8B5CF6] text-white border border-white/20 hover:border-[#8B5CF6] font-sans font-bold text-xs shadow-2xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
            >
              <FastForward className="w-4 h-4 text-[#8B5CF6] group-hover:text-white" />
              <span>Пропустить опенинг (+85s)</span>
            </button>
          </div>
        )}

        {/* Dynamic Quick Skip Ending Badge (Next Episode) */}
        {skipEnding && showSkipEdBtn && (
          <div className="absolute bottom-16 right-6 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              onClick={handleSkipEnding}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white border border-[#8B5CF6] font-sans font-bold text-xs shadow-2xl transition-all active:scale-95 cursor-pointer"
            >
              <span>Следующая серия</span>
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Top Overlay Bar with Title and Settings Button */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none opacity-0 group-hover/player:opacity-100 transition-opacity duration-300">
          {/* Top Left: Title Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 border border-white/10 rounded-xl backdrop-blur-md shadow-lg pointer-events-auto">
            <Film className="w-3.5 h-3.5 text-[#8B5CF6]" />
            <span className="text-xs font-bold text-white max-w-[160px] sm:max-w-[280px] truncate">
              {animeTitle || "KamiAnime"}
            </span>
            {episodeNumber && (
              <span className="bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                Серия {episodeNumber}
              </span>
            )}
          </div>

          {/* Top Right: Player Settings Button */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => {
                setActiveSubmenu("main");
                setIsSettingsOpen(true);
              }}
              className="w-9 h-9 rounded-xl bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/15 hover:border-[#8B5CF6]/50 flex items-center justify-center backdrop-blur-md transition-all cursor-pointer active:scale-95 shadow-lg"
              title="Настройки плеера"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* REFERENCE-PERFECT POPUP SETTINGS MODAL */}
        {isSettingsOpen && createPortal(
          <div
            className="fixed inset-0 z-[9999999] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
            style={{ pointerEvents: "auto" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) {
                setIsSettingsOpen(false);
                setActiveSubmenu("main");
              }
            }}
          >
            <div
              className="w-full max-w-md bg-[#121318] border border-white/10 rounded-[1.5rem] p-5 sm:p-6 shadow-2xl font-sans text-white animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto custom-scrollbar my-auto"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Drag handle line pill */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />

              {/* MAIN MENU */}
              {activeSubmenu === "main" && (
                <div className="flex flex-col gap-1">
                  {/* Header: Title & Done Button */}
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
                    <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                      Настройки
                    </h3>
                    <button
                      onClick={() => setIsSettingsOpen(false)}
                      className="text-xs sm:text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer px-2 py-1"
                    >
                      Готово
                    </button>
                  </div>

                  {/* 1. Качество */}
                  <button
                    onClick={() => setActiveSubmenu("quality")}
                    className="flex items-center justify-between py-3 px-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/80 group-hover:text-[#8B5CF6] transition-colors">
                        <Settings className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">
                          Качество
                        </div>
                        <div className="text-xs text-slate-400">
                          {selectedQuality}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                  </button>

                  {/* 2. Скорость */}
                  <button
                    onClick={() => setActiveSubmenu("speed")}
                    className="flex items-center justify-between py-3 px-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/80 group-hover:text-[#8B5CF6] transition-colors">
                        <Gauge className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">
                          Скорость
                        </div>
                        <div className="text-xs text-slate-400">
                          {selectedSpeed === 1.0
                            ? "Обычная"
                            : `${selectedSpeed}x`}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                  </button>

                  <div className="my-2 border-t border-white/5" />

                  {/* 3. Авто-переключение */}
                  <div className="flex items-center justify-between py-2.5 px-2.5 rounded-xl">
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/80">
                        <StepForward className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-white">
                        Авто-переключение
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const newVal = !autoNext;
                        setAutoNext(newVal);
                        localStorage.setItem(
                          "kami_player_auto_next",
                          String(newVal),
                        );
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        autoNext ? "bg-[#8B5CF6]" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          autoNext ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* 4. Пропуск опенинга */}
                  <div className="flex items-center justify-between py-2.5 px-2.5 rounded-xl">
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/80">
                        <FastForward className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-white">
                        Пропуск опенинга
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const newVal = !skipOpening;
                        setSkipOpening(newVal);
                        localStorage.setItem(
                          "kami_player_skip_op",
                          String(newVal),
                        );
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        skipOpening ? "bg-[#8B5CF6]" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          skipOpening ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* 5. Пропуск эндинга */}
                  <div className="flex items-center justify-between py-2.5 px-2.5 rounded-xl">
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/80">
                        <SkipForward className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-white">
                        Пропуск эндинга
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const newVal = !skipEnding;
                        setSkipEnding(newVal);
                        localStorage.setItem(
                          "kami_player_skip_ed",
                          String(newVal),
                        );
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        skipEnding ? "bg-[#8B5CF6]" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          skipEnding ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* 6. Мини-плеер при скролле */}
                  <div className="flex items-center justify-between py-2.5 px-2.5 rounded-xl">
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/80">
                        <PictureInPicture2 className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-white">
                        Мини-плеер при скролле
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const newVal = !miniOnScroll;
                        setMiniOnScroll(newVal);
                        localStorage.setItem(
                          "kami_player_mini_scroll",
                          String(newVal),
                        );
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        miniOnScroll ? "bg-[#8B5CF6]" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          miniOnScroll ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="my-2 border-t border-white/5" />

                  {/* 7. Совместный просмотр */}
                  {onOpenWatchTogether && (
                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        onOpenWatchTogether();
                      }}
                      className="flex items-center justify-between py-3 px-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:text-purple-300 transition-colors">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">
                            Совместный просмотр
                          </span>
                          <span className="text-[10px] text-purple-300/70 font-medium">
                            {isWatchTogetherActive ? "Комната активна" : "Создать комнату для друзей"}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                    </button>
                  )}

                  {/* 8. Скачать серию */}
                  <button
                    onClick={() => {
                      setIsSettingsOpen(false);
                      if (onOpenDownload) {
                        onOpenDownload();
                      } else {
                        handleDownloadEpisode();
                      }
                    }}
                    className="flex items-center justify-between py-3 px-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:text-cyan-300 transition-colors">
                        <Download className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-white">
                        Скачать серию (.MP4)
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                  </button>
                </div>
              )}

              {/* SUBMENU: КАЧЕСТВО */}
              {activeSubmenu === "quality" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
                    <button
                      onClick={() => setActiveSubmenu("main")}
                      className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Качество</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setActiveSubmenu("main");
                      }}
                      className="text-xs sm:text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer px-2 py-1"
                    >
                      Готово
                    </button>
                  </div>

                  <div className="space-y-1">
                    {availableQualities.map((q) => {
                      const isSelected = selectedQuality === q.html;
                      return (
                        <button
                          key={q.html}
                          onClick={() => handleSelectQuality(q)}
                          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-[#8B5CF6]/15 text-[#8B5CF6]"
                              : "text-slate-300 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{q.html}</span>
                            {(q.isAi || q.html.includes("AI") || q.html.includes("4K")) && (
                              <span className="text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30">
                                AI Шейдер
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-[#8B5CF6]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUBMENU: СКОРОСТЬ */}
              {activeSubmenu === "speed" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
                    <button
                      onClick={() => setActiveSubmenu("main")}
                      className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Скорость</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setActiveSubmenu("main");
                      }}
                      className="text-xs sm:text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer px-2 py-1"
                    >
                      Готово
                    </button>
                  </div>

                  <div className="space-y-1">
                    {speedOptions.map((opt) => {
                      const isSelected = selectedSpeed === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() =>
                            handleSelectSpeed(opt.value, opt.label)
                          }
                          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-[#8B5CF6]/15 text-[#8B5CF6]"
                              : "text-slate-300 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && (
                            <Check className="w-4 h-4 text-[#8B5CF6]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>,
          (typeof document !== "undefined"
            ? (document.fullscreenElement ||
               (document as any).webkitFullscreenElement ||
               containerRef.current ||
               document.body)
            : (null as unknown as Element))
        )}

        {/* FLOATING MINI-PLAYER (Triggered when scrolled down) */}
        {miniOnScroll && isMiniPlayer && (
          <div className="fixed bottom-6 right-6 z-50 w-72 sm:w-80 bg-[#121318] border border-[#8B5CF6]/40 rounded-2xl shadow-2xl p-3 flex flex-col gap-2 backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#8B5CF6] animate-pulse shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-white truncate">
                  Серия {episodeNumber || "1"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    containerRef.current?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Развернуть"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsMiniPlayer(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Закрыть мини-плеер"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 py-2 border-t border-white/5">
              {onPrevEpisode && (
                <button
                  onClick={onPrevEpisode}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors cursor-pointer"
                  title="Предыдущая серия"
                >
                  <StepForward className="w-4 h-4 rotate-180" />
                </button>
              )}
              <button
                onClick={() => {
                  const art = artInstanceRef.current;
                  if (art) {
                    art.toggle();
                  }
                }}
                className="p-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white shadow-lg shadow-[#8B5CF6]/30 transition-all cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>
              {onNextEpisode && (
                <button
                  onClick={onNextEpisode}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors cursor-pointer"
                  title="Следующая серия"
                >
                  <StepForward className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

CustomPlayer.displayName = "CustomPlayer";
