import React, { useState, useEffect } from "react";
import { Download, Loader2, Film, CheckCircle, AlertTriangle, RefreshCw, Crown } from "lucide-react";
import { getCleanPlaylistUrl } from "../utils/media";
import { useAuth } from "../context/AuthContext";

interface BrowserDownloadWidgetProps {
  episodeUrl: string;
  fallbackUrl?: string;
  preferredProvider?: "aniboom" | "kodik" | string;
  animeTitle: string;
  episodeNumber: string | number;
  shikimoriId?: string | number;
  translationId?: string | number;
}

interface DownloadProgress {
  id: string;
  stage: string; // 'loading_libs' | 'fetching_playlist' | 'downloading' | 'muxing' | 'ready' | 'failed'
  processed: number;
  total: number;
  progress: number;
  status: 'running' | 'success' | 'failed';
  error?: string;
  fileName?: string;
}

interface ParsedStream {
  quality: number;
  bandwidth: number;
  url: string;
}

export const BrowserDownloadWidget: React.FC<BrowserDownloadWidgetProps> = ({
  episodeUrl,
  fallbackUrl,
  preferredProvider,
  animeTitle,
  episodeNumber,
  shikimoriId,
  translationId,
}) => {
  const { isVip, openPremiumModal } = useAuth();
  const [qualities, setQualities] = useState<string[]>([]);
  const [loadingQualities, setLoadingQualities] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string>(episodeUrl);
  const [resolvedProvider, setResolvedProvider] = useState<"aniboom" | "kodik">("aniboom");
  
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [localDownloadBlobUrl, setLocalDownloadBlobUrl] = useState<string | null>(null);

  // Load available qualities from AniBoom or Kodik playlist endpoint
  useEffect(() => {
    if (!episodeUrl) return;
    setActiveUrl(episodeUrl);

    let isMounted = true;

    const fetchQualities = async () => {
      setLoadingQualities(true);
      setError(null);
      setQualities([]);

      // Attempt 1: Try primary URL (AniBoom prioritized)
      try {
        const primaryUrl = getCleanPlaylistUrl(episodeUrl, fallbackUrl, null, true);
        const isAniboom = episodeUrl.includes("aniboom") || preferredProvider === "aniboom" || primaryUrl.includes("proxy-4k");

        const res = await fetch(primaryUrl);
        const text = await res.text();
        const trimmed = text.trim();
        const isXmlOrMpd = trimmed.startsWith("<?xml") || trimmed.startsWith("<MPD") || trimmed.startsWith("<mpd") || primaryUrl.includes(".mpd");
        const isHtml = trimmed.toLowerCase().startsWith("<!doctype") || trimmed.toLowerCase().startsWith("<html") || trimmed.toLowerCase().startsWith("<head") || trimmed.toLowerCase().startsWith("<body");

        if (isXmlOrMpd || (isAniboom && !isHtml && res.ok)) {
          if (isMounted) {
            setQualities(["1080", "720", "480", "360"]);
            setActiveUrl(episodeUrl);
            setResolvedProvider("aniboom");
            setLoadingQualities(false);
            return;
          }
        }

        if (!isHtml && res.ok) {
          let data: any = null;
          try {
            data = JSON.parse(text);
          } catch (_) {
            data = null;
          }

          if (data && data.success && Array.isArray(data.qualities) && data.qualities.length > 0) {
            if (isMounted) {
              let qualList: (string | number)[] = [...data.qualities];
              if (isAniboom && !qualList.includes(1080) && !qualList.includes("1080")) {
                qualList.push(1080);
              }
              const sorted = qualList.sort((a, b) => Number(b) - Number(a));
              setQualities(sorted.map(String));
              setActiveUrl(episodeUrl);
              setResolvedProvider(isAniboom || sorted.includes(1080) || sorted.includes("1080") ? "aniboom" : "kodik");
              setLoadingQualities(false);
              return;
            }
          }
        }
      } catch (primaryErr) {
        console.warn("Primary resolution attempt handled gracefully:", primaryErr);
      }

      // Attempt 2: If primary failed and fallbackUrl exists, try fallback (Kodik)
      if (fallbackUrl && fallbackUrl !== episodeUrl) {
        try {
          const fallbackReqUrl = getCleanPlaylistUrl(fallbackUrl, null, null, true);
          const fRes = await fetch(fallbackReqUrl);
          const fText = await fRes.text();
          const fTrimmed = fText.trim().toLowerCase();
          const isFHtml = fTrimmed.startsWith("<!doctype") || fTrimmed.startsWith("<html") || fTrimmed.startsWith("<head") || fTrimmed.startsWith("<body");

          if (!isFHtml && fRes.ok) {
            let fData: any = null;
            try {
              fData = JSON.parse(fText);
            } catch (_) {}
            if (fData && fData.success && Array.isArray(fData.qualities) && fData.qualities.length > 0) {
              if (isMounted) {
                const sorted = [...fData.qualities].sort((a, b) => Number(b) - Number(a));
                setQualities(sorted.map(String));
                setActiveUrl(fallbackUrl);
                setResolvedProvider("kodik");
                setLoadingQualities(false);
                return;
              }
            }
          }
        } catch (fErr) {
          console.error("Fallback Kodik resolution attempt failed:", fErr);
        }
      }

      // Default fallback qualities so download buttons always work
      if (isMounted) {
        const isAniboom = episodeUrl.includes("aniboom") || preferredProvider === "aniboom";
        setQualities(isAniboom ? ["1080", "720", "480", "360"] : ["720", "480", "360"]);
        setResolvedProvider(isAniboom ? "aniboom" : "kodik");
        setLoadingQualities(false);
      }
    };

    fetchQualities();
    
    // Clear download state when episode changes
    setProgress(null);
    setDownloading(false);
    if (localDownloadBlobUrl) {
      URL.revokeObjectURL(localDownloadBlobUrl);
      setLocalDownloadBlobUrl(null);
    }

    return () => {
      isMounted = false;
    };
  }, [episodeUrl, fallbackUrl]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (localDownloadBlobUrl) URL.revokeObjectURL(localDownloadBlobUrl);
    };
  }, [localDownloadBlobUrl]);

  // Function to dynamically load mux.js from CDN for TS transmuxing
  const loadMuxJs = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).muxjs) {
        resolve();
        return;
      }
      
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/mux.js/6.0.1/mux.min.js";
      script.onload = () => {
        if ((window as any).muxjs) {
          resolve();
        } else {
          reject(new Error("Не удалось инициализировать библиотеку mux.js"));
        }
      };
      script.onerror = () => reject(new Error("Ошибка загрузки конвертера видео (mux.js)."));
      document.head.appendChild(script);
    });
  };

  /**
   * Helper to resolve relative URL against base URL
   */
  const resolveAbsoluteUrl = (relativeOrAbsolute: string, baseUrl: string): string => {
    const trimmed = relativeOrAbsolute.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) {
      return window.location.origin + trimmed;
    }
    try {
      const parsedBase = new URL(baseUrl, window.location.origin);
      // If baseUrl is a proxy endpoint like /api/proxy-4k?url=https://...
      if (parsedBase.pathname.includes("proxy-4k") && parsedBase.searchParams.get("url")) {
        const originalUrl = parsedBase.searchParams.get("url")!;
        const resolvedOriginal = new URL(trimmed, originalUrl).toString();
        return `${window.location.origin}/api/proxy-4k?url=${encodeURIComponent(resolvedOriginal)}`;
      }
      return new URL(trimmed, parsedBase).toString();
    } catch (_) {
      return `${window.location.origin}/api/media/${trimmed}`;
    }
  };

  /**
   * Recursively parse and resolve media segments and optional init segment
   */
  const fetchAndResolveMediaPlaylist = async (
    targetUrl: string,
    targetQuality: string,
    depth = 0
  ): Promise<{ isFmp4: boolean; initSegmentUrl: string | null; segmentUrls: string[] }> => {
    if (depth > 4) {
      throw new Error("Слишком много перенаправлений в плейлисте");
    }

    const res = await fetch(targetUrl);
    if (!res.ok) {
      throw new Error(`Ошибка загрузки плейлиста (${res.status})`);
    }

    const playlistText = await res.text();
    const trimmedText = playlistText.trim();
    const isHtmlResponse = trimmedText.toLowerCase().startsWith("<!doctype") || trimmedText.toLowerCase().startsWith("<html");
    if (isHtmlResponse) {
      throw new Error("Неверный формат ответа видеосервера (HTML вместо HLS)");
    }

    // Case 1: Master Playlist (contains #EXT-X-STREAM-INF)
    if (playlistText.includes("#EXT-X-STREAM-INF")) {
      const lines = playlistText.split("\n");
      const streams: ParsedStream[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("#EXT-X-STREAM-INF")) {
          let qual = 720;
          let bandwidth = 0;

          const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
          if (resMatch) {
            qual = parseInt(resMatch[2], 10);
          }
          const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
          if (bwMatch) {
            bandwidth = parseInt(bwMatch[1], 10);
          }

          // Find the next non-empty, non-comment line for the stream URL
          let nextUrl = "";
          for (let j = i + 1; j < lines.length; j++) {
            const candidate = lines[j].trim();
            if (candidate && !candidate.startsWith("#")) {
              nextUrl = candidate;
              i = j;
              break;
            }
          }

          if (nextUrl) {
            streams.push({
              quality: qual,
              bandwidth,
              url: resolveAbsoluteUrl(nextUrl, targetUrl)
            });
          }
        }
      }

      if (streams.length === 0) {
        throw new Error("Не удалось извлечь потоки из мастер-плейлиста.");
      }

      // Find the stream matching requested quality or the closest match
      const reqNum = parseInt(targetQuality, 10) || 720;
      let matchedStream = streams.find(s => s.quality === reqNum);
      if (!matchedStream) {
        // Find closest
        streams.sort((a, b) => Math.abs(a.quality - reqNum) - Math.abs(b.quality - reqNum));
        matchedStream = streams[0];
      }

      // Recurse to fetch the actual media variant playlist
      return fetchAndResolveMediaPlaylist(matchedStream.url, targetQuality, depth + 1);
    }

    // Case 2: Media Playlist (contains segments)
    let initSegmentUrl: string | null = null;
    const isFmp4 = playlistText.includes("#EXT-X-MAP");

    const mapMatch = playlistText.match(/#EXT-X-MAP:URI="([^"]+)"/i);
    if (mapMatch && mapMatch[1]) {
      initSegmentUrl = resolveAbsoluteUrl(mapMatch[1], targetUrl);
    }

    const lines = playlistText.split("\n");
    const segmentUrls: string[] = [];

    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        const resolved = resolveAbsoluteUrl(line, targetUrl);
        if (resolved) {
          segmentUrls.push(resolved);
        }
      }
    }

    if (segmentUrls.length === 0) {
      throw new Error("В выбранном качестве нет доступных фрагментов для скачивания.");
    }

    return {
      isFmp4,
      initSegmentUrl,
      segmentUrls
    };
  };

  const handleStartDownload = async (quality: string) => {
    if (downloading) return;

    if (!isVip) {
      openPremiumModal("Скачивание серий в MP4 без ограничений");
      return;
    }

    setError(null);
    setSelectedQuality(quality);
    setDownloading(true);
    setProgress(null);

    if (localDownloadBlobUrl) {
      URL.revokeObjectURL(localDownloadBlobUrl);
      setLocalDownloadBlobUrl(null);
    }

    const outputFileName = `${animeTitle.replace(/[\/:*?"<>|]/g, "_")}_Ep_${episodeNumber}_${quality}p.mp4`;

    try {
      // 1. Prepare video conversion libraries
      setProgress({
        id: "client_download",
        stage: "loading_libs",
        processed: 0,
        total: 1,
        progress: 3,
        status: "running",
        fileName: outputFileName
      });
      await loadMuxJs();

      // 2. Resolve media playlist & segments
      setProgress({
        id: "client_download",
        stage: "fetching_playlist",
        processed: 0,
        total: 1,
        progress: 8,
        status: "running",
        fileName: outputFileName
      });

      let currentUrl = getCleanPlaylistUrl(activeUrl, fallbackUrl, quality, false);
      let playlistResult: { isFmp4: boolean; initSegmentUrl: string | null; segmentUrls: string[] };

      try {
        playlistResult = await fetchAndResolveMediaPlaylist(currentUrl, quality);
      } catch (primaryErr) {
        // Fallback to Kodik if primary failed and fallback exists
        if (fallbackUrl && fallbackUrl !== activeUrl) {
          console.warn("Primary download playlist failed, falling back to Kodik:", primaryErr);
          currentUrl = getCleanPlaylistUrl(fallbackUrl, null, quality, false);
          playlistResult = await fetchAndResolveMediaPlaylist(currentUrl, quality);
          setActiveUrl(fallbackUrl);
          setResolvedProvider("kodik");
        } else {
          throw primaryErr;
        }
      }

      const { isFmp4, initSegmentUrl, segmentUrls } = playlistResult;
      const totalSegments = segmentUrls.length;

      // 3. Download Init Segment if fMP4
      let initBuffer: ArrayBuffer | null = null;
      if (initSegmentUrl) {
        try {
          const initRes = await fetch(initSegmentUrl);
          if (initRes.ok) {
            initBuffer = await initRes.arrayBuffer();
          }
        } catch (initErr) {
          console.warn("Could not fetch fMP4 init segment:", initErr);
        }
      }

      // 4. Download Segments with high-speed parallel worker pool
      setProgress({
        id: "client_download",
        stage: "downloading",
        processed: 0,
        total: totalSegments,
        progress: 12,
        status: "running",
        fileName: outputFileName
      });

      const concurrency = 6;
      const chunkBuffers = new Array<ArrayBuffer>(totalSegments);
      let completedCount = 0;
      let activeIndex = 0;

      const downloadChunk = async (index: number, url: string) => {
        let attempt = 0;
        const maxAttempts = 3;
        while (attempt < maxAttempts) {
          try {
            attempt++;
            const segmentRes = await fetch(url);
            if (!segmentRes.ok) throw new Error(`Chunk status: ${segmentRes.status}`);
            const buf = await segmentRes.arrayBuffer();
            chunkBuffers[index] = buf;
            return;
          } catch (chunkErr) {
            if (attempt === maxAttempts) {
              throw new Error(`Ошибка загрузки фрагмента ${index + 1} из ${totalSegments}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
        }
      };

      const worker = async () => {
        while (activeIndex < totalSegments) {
          const currentIndex = activeIndex++;
          await downloadChunk(currentIndex, segmentUrls[currentIndex]);
          completedCount++;
          
          const downloadProgressPercent = 12 + Math.round((completedCount / totalSegments) * 80);
          setProgress({
            id: "client_download",
            stage: "downloading",
            processed: completedCount,
            total: totalSegments,
            progress: downloadProgressPercent,
            status: "running",
            fileName: outputFileName
          });
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, totalSegments) }, worker);
      await Promise.all(workers);

      // 5. Muxing / MP4 Assembly Stage
      setProgress({
        id: "client_download",
        stage: "muxing",
        processed: totalSegments,
        total: totalSegments,
        progress: 95,
        status: "running",
        fileName: outputFileName
      });

      let finalMp4Blob: Blob;

      if (isFmp4 && initBuffer) {
        // Direct fMP4 assembly: combine init segment + all media fragment buffers
        const allBuffers = [initBuffer, ...chunkBuffers.filter(Boolean)];
        finalMp4Blob = new Blob(allBuffers, { type: "video/mp4" });
      } else {
        // TS to MP4 transmuxing with mux.js
        try {
          const transmuxer = new (window as any).muxjs.mp4.Transmuxer({
            baseMediaDecodeTime: 0,
            keepOriginalTimestamps: false
          });

          const remuxedSegs: Uint8Array[] = [];
          let remuxedInitSegment: any = null;
          let remuxedBytesLength = 0;

          transmuxer.on('data', (event: any) => {
            if (event.type === 'combined' || event.type === 'video') {
              if (!remuxedInitSegment) {
                remuxedInitSegment = event.initSegment;
              }
              remuxedSegs.push(event.data);
              remuxedBytesLength += event.data.byteLength;
            }
          });

          for (let i = 0; i < chunkBuffers.length; i++) {
            if (chunkBuffers[i]) {
              transmuxer.push(new Uint8Array(chunkBuffers[i]));
            }
          }

          transmuxer.flush();

          if (remuxedInitSegment && remuxedSegs.length > 0) {
            const mp4Buffer = new Uint8Array(remuxedInitSegment.byteLength + remuxedBytesLength);
            mp4Buffer.set(remuxedInitSegment, 0);

            let offset = remuxedInitSegment.byteLength;
            for (const seg of remuxedSegs) {
              mp4Buffer.set(seg, offset);
              offset += seg.byteLength;
            }

            finalMp4Blob = new Blob([mp4Buffer], { type: "video/mp4" });
          } else {
            // Fallback to raw container blob
            finalMp4Blob = new Blob(chunkBuffers.filter(Boolean), { type: "video/mp4" });
          }
        } catch (transmuxErr) {
          console.warn("mux.js transmuxing fallback:", transmuxErr);
          finalMp4Blob = new Blob(chunkBuffers.filter(Boolean), { type: "video/mp4" });
        }
      }

      const localUrl = URL.createObjectURL(finalMp4Blob);
      setLocalDownloadBlobUrl(localUrl);

      setProgress({
        id: "client_download",
        stage: "ready",
        processed: totalSegments,
        total: totalSegments,
        progress: 100,
        status: "success",
        fileName: outputFileName
      });

      // Trigger automatic download
      const link = document.createElement("a");
      link.href = localUrl;
      link.setAttribute("download", outputFileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setDownloading(false);
    } catch (err: any) {
      console.error("Browser MP4 download failed:", err);
      setError(err.message || "Ошибка скачивания серии");
      setDownloading(false);
      setProgress({
        id: "client_download",
        stage: "failed",
        processed: 0,
        total: 1,
        progress: 0,
        status: "failed",
        error: err.message || "Ошибка загрузки .MP4"
      });
    }
  };

  const getStageMessage = (stage: string) => {
    switch (stage) {
      case "loading_libs":
        return "Подготовка загрузчика...";
      case "fetching_playlist":
        return "Получение плейлиста серии...";
      case "downloading":
        return progress ? `Скачивание видеофрагментов (${progress.processed} из ${progress.total || "..."})...` : "Скачивание серии...";
      case "muxing":
        return "Сборка готового MP4 файла...";
      case "ready":
        return "Серия успешно скачана!";
      case "failed":
        return "Ошибка скачивания";
      default:
        return "Подготовка...";
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 transition-all duration-300 space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs uppercase tracking-wider font-extrabold text-slate-300">
            Скачать серию в формате .MP4:
          </label>
          {!loadingQualities && qualities.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold">
              {resolvedProvider === "aniboom" && qualities.includes("1080") ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  AniBoom 1080p Ultra HD
                </span>
              ) : (
                <span className="text-cyan-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  {qualities[0] ? `${qualities[0]}p HD` : 'HD качество'}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {loadingQualities && (
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold py-2">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
              Проверка доступных вариантов качества...
            </div>
          )}

          {error && (
            <div className="text-red-400 text-xs font-semibold flex items-center justify-between gap-2 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl w-full">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{error}</span>
              </div>
              {fallbackUrl && fallbackUrl !== activeUrl && (
                <button
                  onClick={() => {
                    setActiveUrl(fallbackUrl);
                    setError(null);
                    setQualities(["720", "480", "360"]);
                  }}
                  className="flex items-center gap-1 text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2.5 py-1 rounded-lg font-bold"
                >
                  <RefreshCw className="w-3 h-3" />
                  Переключить на Kodik
                </button>
              )}
            </div>
          )}

          {!loadingQualities && qualities.length > 0 && !downloading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full pt-1">
              {qualities.map((qual) => (
                <button
                  key={qual}
                  onClick={() => handleStartDownload(qual)}
                  disabled={downloading}
                  className={`flex items-center justify-center gap-1.5 border transition-all duration-300 font-bold text-xs py-2.5 rounded-xl cursor-pointer shadow-lg active:scale-95 disabled:opacity-50 ${
                    qual === "1080"
                      ? "bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-white border-cyan-500/30 hover:border-cyan-500"
                      : "bg-white/5 hover:bg-cyan-500 hover:text-white border-white/5 hover:border-cyan-500 text-slate-200"
                  }`}
                >
                  <Film className="w-3.5 h-3.5 shrink-0" />
                  <span>{qual}p (.mp4)</span>
                  {!isVip && (
                    <Crown className="w-3 h-3 fill-current text-yellow-400 shrink-0 ml-0.5" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {downloading && progress && (
        <div className="border-t border-white/5 pt-5 space-y-2.5 animate-fade-in">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              <span>{getStageMessage(progress.stage)}</span>
            </div>
            <span className="font-mono text-cyan-400 font-bold text-xs bg-cyan-500/10 px-2 py-0.5 rounded">
              {progress.progress}%
            </span>
          </div>

          <div className="h-1.5 w-full bg-[#111827] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {!downloading && progress?.status === "success" && (
        <div className="border-t border-white/5 pt-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-cyan-500/5 border border-cyan-500/10 p-4 rounded-xl transition-all duration-300 font-sans">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-cyan-400 shrink-0" />
            <div>
              <p className="text-white font-bold text-sm">Серия успешно сохранена!</p>
              <p className="text-slate-400 text-xs mt-0.5">Файл .mp4 скачан в папку «Загрузки» и готов к просмотру.</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (localDownloadBlobUrl) {
                const link = document.createElement("a");
                link.href = localDownloadBlobUrl;
                link.setAttribute("download", progress.fileName || "video.mp4");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            }}
            className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold text-xs uppercase px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-300 hover:scale-105"
          >
            <Download className="w-4 h-4" />
            Сохранить повторно
          </button>
        </div>
      )}

      {shikimoriId && (
        <div className="border-t border-white/10 pt-5 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0088cc]/5 border border-[#0088cc]/10 p-5 rounded-2xl">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-[#0088cc]/25 text-[#0088cc] rounded-xl self-start mt-0.5 shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.1.02-1.62 1.03-4.57 3.03-.43.3-.82.44-1.17.43-.39-.01-1.15-.22-1.71-.41-.69-.23-1.24-.35-1.19-.74.03-.2.3-.4.81-.6 3.19-1.39 5.32-2.3 6.39-2.73 3.04-1.24 3.67-1.45 4.09-1.46.09 0 .3.02.43.13.11.09.14.21.16.3.02.08.03.24.01.37z" />
                </svg>
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">Альтернативный способ: Скачать через Telegram</h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  Наш Telegram-бот поможет моментально получить нужную серию. Вы получите готовое видео прямо в чате для удобного просмотра офлайн!
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME) || "KamiAnime_bot";
                window.open(`https://t.me/${botUsername}?start=dl_${shikimoriId}_ep${episodeNumber}_tr${translationId || 0}`, "_blank");
              }}
              className="w-full sm:w-auto px-5 py-3 bg-[#0088cc] hover:bg-[#008cdd] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 shrink-0 text-center"
            >
              Скачать в ТГ (.MP4)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

