import React, { useEffect, useRef, forwardRef, useState, useCallback } from "react";
import { openMangaPage } from "../utils/mangaNav";
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
  Crown,
  BookOpen,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
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

class AnimeWebGL1080p {
  public isActive = false;
  private canvas: HTMLCanvasElement | null = null;
  private video: HTMLVideoElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private animFrameId: number | null = null;
  private targetRes = -1;
  private isDestroyed = false;

  constructor(canvas?: HTMLCanvasElement, video?: HTMLVideoElement) {
    if (!canvas || !video) return;
    this.canvas = canvas;
    this.video = video;
    this.initGL();
  }

  private initGL() {
    if (!this.canvas) return;
    try {
      const gl = (this.canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: false }) ||
        this.canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (!gl) return;
      this.gl = gl;

      const vsSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
        }
      `;

      const fsSource = `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;
        uniform vec2 u_resolution;
        uniform float u_sharpness;

        void main() {
          vec2 step = 1.0 / u_resolution;
          vec4 c = texture2D(u_image, v_texCoord);
          vec4 n = texture2D(u_image, v_texCoord + vec2(0.0, -step.y));
          vec4 s = texture2D(u_image, v_texCoord + vec2(0.0, step.y));
          vec4 e = texture2D(u_image, v_texCoord + vec2(step.x, 0.0));
          vec4 w = texture2D(u_image, v_texCoord + vec2(-step.x, 0.0));

          vec4 min_c = min(c, min(min(n, s), min(e, w)));
          vec4 max_c = max(c, max(max(n, s), max(e, w)));

          vec4 laplacian = (n + s + e + w) - 4.0 * c;
          vec4 sharpened = c - u_sharpness * laplacian;

          gl_FragColor = clamp(sharpened, min_c, max_c);
        }
      `;

      const createShader = (ctx: WebGLRenderingContext, type: number, src: string) => {
        const shader = ctx.createShader(type);
        if (!shader) return null;
        ctx.shaderSource(shader, src);
        ctx.compileShader(shader);
        if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
          ctx.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return;

      const prog = gl.createProgram();
      if (!prog) return;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      this.program = prog;

      const posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );

      const posAttr = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(posAttr);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      const texBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
        gl.STATIC_DRAW
      );

      const texAttr = gl.getAttribLocation(prog, 'a_texCoord');
      gl.enableVertexAttribArray(texAttr);
      gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 0, 0);

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.texture = tex;
    } catch (e) {
      console.warn('[AnimeWebGL1080p Init Error]', e);
    }
  }

  public setTargetResolution(res: number) {
    this.targetRes = res;
    if (res <= 0 && res !== 0) {
      this.stop();
      if (this.canvas) this.canvas.style.opacity = '0';
    } else {
      if (this.canvas) this.canvas.style.opacity = '1';
      this.start();
    }
  }

  public start() {
    if (this.isDestroyed || !this.gl || !this.video || !this.canvas) return;
    this.isActive = true;
    if (this.canvas) this.canvas.style.opacity = '1';

    const render = () => {
      if (this.isDestroyed || !this.isActive) return;
      if (this.video && this.gl && this.program && this.canvas && this.video.readyState >= 2 && !this.video.paused) {
        const vw = this.video.videoWidth || 1280;
        const vh = this.video.videoHeight || 720;
        if (this.canvas.width !== vw || this.canvas.height !== vh) {
          this.canvas.width = vw;
          this.canvas.height = vh;
          this.gl.viewport(0, 0, vw, vh);
        }

        this.gl.useProgram(this.program);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          this.video
        );

        const resLoc = this.gl.getUniformLocation(this.program, 'u_resolution');
        this.gl.uniform2f(resLoc, vw, vh);

        const sharpLoc = this.gl.getUniformLocation(this.program, 'u_sharpness');
        this.gl.uniform1f(sharpLoc, 0.4);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
      }
      this.animFrameId = requestAnimationFrame(render);
    };

    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(render);
  }

  public stop() {
    this.isActive = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.canvas) {
      this.canvas.style.opacity = '0';
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.stop();
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.canvas = null;
    this.video = null;
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

    const { isVip, openPremiumModal } = useAuth();
    const pendingPremiumModalRef = useRef<boolean>(false);

    const triggerDeferredPremiumModal = useCallback(() => {
      if (pendingPremiumModalRef.current) {
        pendingPremiumModalRef.current = false;
        setTimeout(() => {
          openPremiumModal("Премиум функции");
        }, 250);
      }
    }, [openPremiumModal]);

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
              : "KamiPlayer (Direct)"
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

    // Switch HLS audio track according to translationTitle / audioTrackNames
    useEffect(() => {
      if (!translationTitle) return;
      const art = artInstanceRef.current;
      if (art && (art as any).hls) {
        const hls = (art as any).hls;
        const tracks = hls.audioTracks || [];
        if (tracks.length > 0) {
          const idx = tracks.findIndex((t: any, i: number) => {
            const name = (audioTrackNamesRef.current && audioTrackNamesRef.current[i]) || t.name || "";
            return name && (
              name.toLowerCase().includes(translationTitle.toLowerCase()) ||
              translationTitle.toLowerCase().includes(name.toLowerCase())
            );
          });
          if (idx !== -1 && hls.audioTrack !== idx) {
            console.log(`[HLS Audio] Switching audio track to #${idx} (${translationTitle})`);
            hls.audioTrack = idx;
          }
        }
      }
    }, [translationTitle]);

    // Settings Modal State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeSubmenu, setActiveSubmenu] = useState<"main" | "quality" | "speed">("main");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [mangaBridge, setMangaBridge] = useState<{ mappedChapter?: number | string; adaptationSummary?: string } | null>(null);

    useEffect(() => {
      if (!animeTitle) return;
      fetch(`/api/manga/anime-bridge?title=${encodeURIComponent(animeTitle)}&episode=${episodeNumber || 1}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.success) {
            setMangaBridge(data);
          }
        })
        .catch(() => {});
    }, [animeTitle, episodeNumber]);

    useEffect(() => {
      const handleFullscreenChange = () => {
        const isFs = !!document.fullscreenElement;
        setIsFullscreen(isFs);
        if (!isFs) {
          triggerDeferredPremiumModal();
        }
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
    }, [triggerDeferredPremiumModal]);

    // Unmount / Player close trigger for deferred premium modal
    useEffect(() => {
      return () => {
        triggerDeferredPremiumModal();
      };
    }, [triggerDeferredPremiumModal]);

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
      (!provider && !src.includes("kodik") && !src.includes("r2.cloudflarestorage.com"))
    );

    const isNative4KStream = Boolean(
      src.includes("4k") ||
      src.includes("2160") ||
      src.includes("r2.cloudflarestorage.com") ||
      src.includes("cdn1.kamianime.club") ||
      src.includes("cdn.kamianime.club") ||
      (animeId && (animeId === "48849" || animeId === "32281" || animeId === "38826" || animeId === "16782"))
    );

    const isKodikStream = Boolean(
      !isAniboomStream && !isNative4KStream && (
        (provider && provider.toLowerCase().includes("kodik")) ||
        src.includes("kodik")
      )
    );

    const [availableQualities, setAvailableQualities] = useState<
      { html: string; level: number; targetH?: number; isAi?: boolean }[]
    >(() => {
      if (isNative4KStream) {
        return [
          { html: "4K Ultra HD", level: 0, targetH: 2160 },
          { html: "1080p", level: 1, targetH: -1 },
          { html: "720p", level: 2, targetH: -1 },
          { html: "Авто", level: -1, targetH: 0 },
        ];
      }
      if (isKodikStream) {
        return [
          { html: "1080p (Anime4K)", level: 0, targetH: 1080, isAi: true },
          { html: "720p", level: 0, targetH: -1 },
          { html: "480p", level: 1, targetH: -1 },
          { html: "360p", level: 2, targetH: -1 },
          { html: "Авто", level: -1, targetH: 0 },
        ];
      }
      return [
        { html: "1080p", level: 0, targetH: -1 },
        { html: "720p", level: 1, targetH: -1 },
        { html: "480p", level: 2, targetH: -1 },
        { html: "360p", level: 3, targetH: -1 },
        { html: "Авто", level: -1, targetH: 0 },
      ];
    });

    // Sync default available qualities when source or provider changes
    useEffect(() => {
      if (isNative4KStream) {
        setAvailableQualities([
          { html: "4K Ultra HD", level: 0, targetH: 2160 },
          { html: "1080p", level: 1, targetH: -1 },
          { html: "720p", level: 2, targetH: -1 },
          { html: "Авто", level: -1, targetH: 0 },
        ]);
      } else if (isKodikStream) {
        setAvailableQualities([
          { html: "1080p (Anime4K)", level: 0, targetH: 1080, isAi: true },
          { html: "720p", level: 0, targetH: -1 },
          { html: "480p", level: 1, targetH: -1 },
          { html: "360p", level: 2, targetH: -1 },
          { html: "Авто", level: -1, targetH: 0 },
        ]);
      } else {
        setAvailableQualities([
          { html: "1080p", level: 0, targetH: -1 },
          { html: "720p", level: 1, targetH: -1 },
          { html: "480p", level: 2, targetH: -1 },
          { html: "360p", level: 3, targetH: -1 },
          { html: "Авто", level: -1, targetH: 0 },
        ]);
      }
    }, [src, provider, streamType, isKodikStream, isNative4KStream, isAniboomStream]);

    // Keep selected quality valid across provider/quality list changes
    useEffect(() => {
      if (availableQualities.length > 0) {
        const savedQ = localStorage.getItem("kami_player_selected_quality") || selectedQuality;
        const exactMatch = availableQualities.find((q) => q.html === savedQ);
        if (exactMatch) {
          setSelectedQuality(exactMatch.html);
          selectedQualityRef.current = exactMatch.html;
          return;
        }
        // Match closest quality category if exact label differs
        if (savedQ.includes("4K")) {
          const match4k = availableQualities.find((q) => q.html.includes("4K") || q.targetH === 2160);
          if (match4k) {
            setSelectedQuality(match4k.html);
            selectedQualityRef.current = match4k.html;
            return;
          }
        }
        if (savedQ.includes("1080")) {
          const match1080 = availableQualities.find((q) => q.html.includes("1080") || q.targetH === 1080);
          if (match1080) {
            setSelectedQuality(match1080.html);
            selectedQualityRef.current = match1080.html;
            return;
          }
        }
        if (savedQ.includes("720")) {
          const match720 = availableQualities.find((q) => q.html.includes("720"));
          if (match720) {
            setSelectedQuality(match720.html);
            selectedQualityRef.current = match720.html;
            return;
          }
        }
        if (savedQ.includes("480")) {
          const match480 = availableQualities.find((q) => q.html.includes("480"));
          if (match480) {
            setSelectedQuality(match480.html);
            selectedQualityRef.current = match480.html;
            return;
          }
        }
        const auto = availableQualities.find((q) => q.html === "Авто") || availableQualities[0];
        if (auto) {
          setSelectedQuality(auto.html);
          selectedQualityRef.current = auto.html;
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
    const onOpenDownloadRef = useRef(onOpenDownload);
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
      onOpenDownloadRef.current = onOpenDownload;
    }, [onOpenDownload]);

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
            ...(!!onOpenDownload
              ? [
                  {
                    name: "download-btn",
                    position: "right",
                    index: 19,
                    html: `
                      <span class="art-icon art-icon-download" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; color: #fff;" title="Скачать серию">
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                      </span>
                    `,
                    click: function () {
                      if (onOpenDownloadRef.current) {
                        onOpenDownloadRef.current();
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

              (player as any).updateSettings({
                streaming: {
                  gaps: {
                    jumpGaps: false,
                    jumpLargeGaps: false
                  }
                }
              });

              // Гарантируем, что манифест идет через proxy-4k
              const manifestUrl = url.includes('/api/proxy-4k')
                ? (url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`)
                : `${window.location.origin}/api/proxy-4k?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://aniboom.one/')}`;

              player.initialize(video, manifestUrl, Boolean(autoPlay));
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

                  const parsedQualities: { html: string; level: number; targetH?: number; isAi?: boolean }[] = [];

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
                if ((artInstance as any).hls) {
                  try {
                    (artInstance as any).hls.stopLoad();
                    (artInstance as any).hls.detachMedia();
                    (artInstance as any).hls.destroy();
                  } catch (_) {}
                }
                const hls = new Hls({
                  enableWorker: true,
                  maxBufferLength: 30,
                  maxMaxBufferLength: 90,
                  maxBufferSize: 120 * 1000 * 1000,
                  capLevelToPlayerSize: true,
                  progressive: true,
                  fragLoadingTimeOut: 25000,
                  manifestLoadingTimeOut: 25000,
                  manifestLoadingMaxRetry: 3,
                  levelLoadingMaxRetry: 3,
                  fragLoadingMaxRetry: 3,
                });
                (artInstance as any).hls = hls;

                const streamUrl = url.startsWith('http')
                  ? url
                  : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;

                hls.attachMedia(video);
                hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                  hls.loadSource(streamUrl);
                });

                hls.on(Hls.Events.ERROR, function (event, data) {
                  if (data.fatal) {
                    console.warn("HLS stream event notice:", data.type, data.details);

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

                  const finalQuals: { html: string; level: number; targetH?: number; isAi?: boolean }[] = [];

                  if (isNative4KStream) {
                    finalQuals.push({ html: "4K Ultra HD", level: 0, targetH: 2160 });
                  } else if (isKodikStream) {
                    finalQuals.push({ html: "1080p (Anime4K)", level: 0, targetH: 1080, isAi: true });
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
                  const parsedLevels = data.levels || hls.levels || [];
                  updateQualitiesFromLevels(parsedLevels);

                  const curQ = selectedQualityRef.current;
                  if (curQ && curQ !== "Авто") {
                    if (curQ.includes("4K") || curQ.includes("1080p (Anime4K")) {
                      const maxLvl = Math.max(0, parsedLevels.length - 1);
                      hls.nextLevel = maxLvl;
                      if (hls.loadLevel !== undefined) hls.loadLevel = maxLvl;
                    } else {
                      const numericH = parseInt(curQ.replace(/\D/g, ""), 10);
                      if (!isNaN(numericH) && numericH > 0) {
                        const matchedIdx = parsedLevels.findIndex((l: any) => l.height === numericH);
                        if (matchedIdx !== -1) {
                          hls.nextLevel = matchedIdx;
                          if (hls.loadLevel !== undefined) hls.loadLevel = matchedIdx;
                        }
                      }
                    }
                  }
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
                      // Only upscale Kodik streams (AniBoom and standard streams are NEVER upscaled)
                      if (isKodikStream && (curQ.includes("Anime4K") || curQ.includes("1080p"))) {
                        upscaler.setTargetResolution(1080);
                        upscaler.start();
                      } else {
                        upscaler.setTargetResolution(-1);
                      }
                    } catch (e) {
                      console.error("Anime WebGL Initialization Error with HLS:", e);
                    }
                  }
                });

                artInstance.on("destroy", () => {
                  try {
                    hls.stopLoad();
                    hls.detachMedia();
                    hls.destroy();
                  } catch (_) {}
                });
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
          const isFs = state || !!document.fullscreenElement;
          setIsFullscreen(isFs);
          if (!isFs) {
            triggerDeferredPremiumModal();
          }
          if (state && containerRef.current && document.fullscreenElement !== containerRef.current) {
            containerRef.current.requestFullscreen?.().catch(() => {});
          }
        });
        art.on("fullscreenWeb", (state: boolean) => {
          const isFs = state || !!document.fullscreenElement;
          setIsFullscreen(isFs);
          if (!isFs) {
            triggerDeferredPremiumModal();
          }
          if (state && containerRef.current && document.fullscreenElement !== containerRef.current) {
            containerRef.current.requestFullscreen?.().catch(() => {});
          }
        });

        // Time updates: Progress, Skip Opening (+85s) & Skip Ending logic
        art.on("video:timeupdate", () => {
          if (!art) return;
          const curr = art.currentTime;
          const dur = art.duration;
          if (curr > 0) {
            lastPlaybackPosRef.current = curr;
          }
          saveProgress(curr, dur);
        });

        // Auto-switch to next episode when current video ends
        art.on("video:ended", () => {
          const isAutoNextActive =
            localStorage.getItem("kami_player_auto_next") !== "false";
          if (isAutoNextActive && onNextEpisodeRef.current) {
            setTimeout(() => {
              onNextEpisodeRef.current?.();
            }, 500);
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

      // WebGL Upscaler resolution mode: ONLY for Kodik (AniBoom is NEVER upscaled)
      if (webglInstanceRef.current) {
        if (isKodikStream && (item.isAi || item.html.includes("Anime4K") || item.html.includes("1080p") || item.targetH === 1080)) {
          webglInstanceRef.current.setTargetResolution(1080);
          webglInstanceRef.current.start();
        } else {
          // Disabled for AniBoom, native 4K, and standard resolutions
          webglInstanceRef.current.setTargetResolution(-1);
        }
      }

      if (art && (art as any).hls) {
        const hls = (art as any).hls;
        try {
          console.log(`[Quality Switch] Applying HLS quality level ${item.level} (${item.html})`);
          let targetLvl = item.level;
          if (item.isAi || targetLvl === -1) {
            targetLvl = (hls.levels && hls.levels.length > 0) ? hls.levels.length - 1 : (item.level >= 0 ? item.level : 0);
          }

          if (item.level === -1 && !item.isAi) {
            hls.currentLevel = -1;
            hls.nextLevel = -1;
          } else {
            hls.nextLevel = targetLvl;
            if (hls.loadLevel !== undefined) hls.loadLevel = targetLvl;
          }

          if (currentPos > 0) {
            lastPlaybackPosRef.current = currentPos;
            if (art.video && Math.abs(art.currentTime - currentPos) > 2) {
              art.currentTime = currentPos;
            }
            if (wasPlaying && art.video && art.video.paused) {
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
        className={`relative w-full aspect-video bg-black overflow-hidden group/player select-none ${
          isFullscreen
            ? "fixed inset-0 z-[999999] w-screen h-screen rounded-none"
            : "rounded-[1.5rem] md:rounded-[2rem]"
        }`}
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
                      if (!isVip) {
                        openPremiumModal("Скачивание серий для оффлайн-просмотра");
                        return;
                      }
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          Скачать серию (.MP4)
                        </span>
                        {!isVip && (
                          <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded-full bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30 flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5 text-[#8B5CF6]" /> Premium
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                  </button>

                  {/* 9. Перейти к манге */}
                  {animeTitle && (
                    <button
                      onClick={() => {
                        setIsSettingsOpen(false);
                        const targetChap = mangaBridge?.mappedChapter || episodeNumber || 1;
                        openMangaPage(animeTitle, episodeNumber || 1, targetChap);
                      }}
                      className="flex items-center justify-between py-3 px-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:text-emerald-300 transition-colors">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              Читать мангу
                            </span>
                            {mangaBridge?.mappedChapter && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold border border-emerald-500/30">
                                Гл. {mangaBridge.mappedChapter}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {mangaBridge?.mappedChapter
                              ? `${episodeNumber || 1} серия ➔ ${mangaBridge.mappedChapter} глава манги`
                              : `Продолжить с ${episodeNumber || 1} серии`}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                    </button>
                  )}
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
