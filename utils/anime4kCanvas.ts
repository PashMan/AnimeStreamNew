// utils/anime4kCanvas.ts

export class MobileAnime4KRenderer {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  
  private isRunning: boolean = false;
  private frameCallbackId: number | null = null;

  private uImageLoc: WebGLUniformLocation | null = null;
  private uTextureSizeLoc: WebGLUniformLocation | null = null;
  private aPositionLoc: number = -1;

  private targetResolution: number = 0; // 0 = Auto, 2160 = 4K, 1080 = 1080p, -1 = Off

  constructor(videoElement: HTMLVideoElement, containerElement: HTMLElement) {
    this.video = videoElement;

    // Create Canvas over video element
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'anime4k-canvas absolute inset-0 w-full h-full pointer-events-none object-contain';
    
    // Insert Canvas above video
    containerElement.appendChild(this.canvas);

    this.initWebGL();
    this.setupListeners();
  }

  private initWebGL() {
    this.gl =
      (this.canvas.getContext('webgl2', {
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
        alpha: false,
      }) as WebGL2RenderingContext | null) ||
      (this.canvas.getContext('webgl', {
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
        alpha: false,
      }) as WebGLRenderingContext | null);

    if (!this.gl) {
      console.warn('[Anime4K Mobile] WebGL not supported, falling back to native video');
      return;
    }

    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.initShaders();
    this.initBuffersAndTextures();
  }

  private setupListeners() {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[Anime4K Mobile] WebGL context lost. Pausing renderer...');
      this.stop();
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.info('[Anime4K Mobile] WebGL context restored. Rebuilding shaders...');
      this.initWebGL();
      this.start();
    });
  }

  private initShaders() {
    if (!this.gl) return;
    const gl = this.gl;

    const vsSource = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + vec2(0.5);
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // High-Fidelity Anime4K Mobile Line Reconstruction & Anti-Aliasing
    const fsSource = `
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

        float lTL = luma(tl); float lTC = luma(tc); float lTR = luma(tr);
        float lML = luma(ml); float lCC = luma(cc); float lMR = luma(mr);
        float lBL = luma(bl); float lBC = luma(bc); float lBR = luma(br);

        // 3x3 Sobel edge detection
        float gx = (lTR + 2.0 * lMR + lBR) - (lTL + 2.0 * lML + lBL);
        float gy = (lBL + 2.0 * lBC + lBR) - (lTL + 2.0 * lTC + lTR);
        float edge = length(vec2(gx, gy));

        if (edge < 0.03) {
          gl_FragColor = vec4(cc, 1.0);
          return;
        }

        // Anime4K Push-Color Line Thinning
        vec2 normal = normalize(vec2(gx, gy) + 0.0001);
        vec3 pNeg = texture2D(u_image, v_texCoord - normal * d * 0.75).rgb;
        vec3 pPos = texture2D(u_image, v_texCoord + normal * d * 0.75).rgb;
        
        float lNeg = luma(pNeg);
        float lPos = luma(pPos);

        vec3 lineCore = lNeg < lPos ? pNeg : pPos;
        float minLuma = min(lNeg, lPos);
        
        float factor = smoothstep(0.04, 0.35, edge);
        vec3 sharpenedLine = lCC > minLuma ? mix(cc, lineCore, factor * 0.45) : cc;

        // Anti-aliasing along tangent
        vec2 tangent = vec2(-normal.y, normal.x);
        vec3 tPos = texture2D(u_image, v_texCoord + tangent * d * 0.5).rgb;
        vec3 tNeg = texture2D(u_image, v_texCoord - tangent * d * 0.5).rgb;
        vec3 smoothedTangent = (sharpenedLine * 2.0 + tPos + tNeg) * 0.25;

        vec3 result = mix(sharpenedLine, smoothedTangent, factor * 0.30);
        gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
      }
    `;

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[Anime4K Mobile Shader Error]', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[Anime4K Mobile Program Link Error]', gl.getProgramInfoLog(prog));
      return;
    }

    this.program = prog;
    this.aPositionLoc = gl.getAttribLocation(prog, 'a_position');
    this.uImageLoc = gl.getUniformLocation(prog, 'u_image');
    this.uTextureSizeLoc = gl.getUniformLocation(prog, 'u_textureSize');
  }

  private initBuffersAndTextures() {
    if (!this.gl || !this.program) return;
    const gl = this.gl;

    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  public setTargetResolution(res: number) {
    this.targetResolution = res;
    if (res === -1) {
      this.stop();
    } else if (!this.isRunning) {
      this.start();
    }
  }

  public start() {
    if (this.isRunning || !this.gl || this.targetResolution === -1) return;
    this.isRunning = true;
    this.video.style.opacity = '0'; // Hide native video, display upscale canvas

    const render = () => {
      if (!this.isRunning) return;

      // Sync canvas dimensions with target upscale resolution
      if (this.video.videoWidth > 0) {
        const vW = this.video.videoWidth;
        const vH = this.video.videoHeight;
        const aspect = vW / vH;
        let targetH = this.targetResolution === 2160 ? 2160 : (this.targetResolution === 1080 ? 1080 : (vH >= 1000 ? 2160 : 1080));
        let targetW = Math.round(targetH * aspect);
        const dpr = Math.min(2.0, window.devicePixelRatio || 1);
        const renderW = Math.floor(targetW * dpr);
        const renderH = Math.floor(targetH * dpr);

        if (this.canvas.width !== renderW || this.canvas.height !== renderH) {
          this.canvas.width = renderW;
          this.canvas.height = renderH;
          if (this.gl) {
            this.gl.viewport(0, 0, renderW, renderH);
          }
        }
      }

      this.drawFrame();

      // Mobile 24FPS frame sync via requestVideoFrameCallback
      if ('requestVideoFrameCallback' in this.video) {
        this.frameCallbackId = (this.video as any).requestVideoFrameCallback(render);
      } else {
        this.frameCallbackId = requestAnimationFrame(render);
      }
    };

    if ('requestVideoFrameCallback' in this.video) {
      this.frameCallbackId = (this.video as any).requestVideoFrameCallback(render);
    } else {
      this.frameCallbackId = requestAnimationFrame(render);
    }
  }

  private drawFrame() {
    if (!this.gl || !this.program || this.video.readyState < 2 || !this.texture) return;
    const gl = this.gl;

    gl.useProgram(this.program);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    } catch (_) {
      return;
    }

    if (this.uImageLoc !== null) {
      gl.uniform1i(this.uImageLoc, 0);
    }
    if (this.uTextureSizeLoc !== null) {
      gl.uniform2f(this.uTextureSizeLoc, this.canvas.width || 1920, this.canvas.height || 1080);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.aPositionLoc);
    gl.vertexAttribPointer(this.aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public stop() {
    this.isRunning = false;
    if (this.frameCallbackId !== null) {
      if ('cancelVideoFrameCallback' in this.video) {
        (this.video as any).cancelVideoFrameCallback(this.frameCallbackId);
      } else {
        cancelAnimationFrame(this.frameCallbackId);
      }
      this.frameCallbackId = null;
    }
    this.video.style.opacity = '1';
    this.canvas.style.opacity = '0';
  }

  public destroy() {
    this.stop();
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.gl = null;
  }
}
