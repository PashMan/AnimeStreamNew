import React, { useState, useEffect, useRef } from "react";
import { Download, Loader2, Film, CheckCircle, AlertTriangle } from "lucide-react";
import { getCleanPlaylistUrl } from "../utils/media";

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

export const BrowserDownloadWidget: React.FC<BrowserDownloadWidgetProps> = ({
  episodeUrl,
  fallbackUrl,
  preferredProvider,
  animeTitle,
  episodeNumber,
  shikimoriId,
  translationId,
}) => {
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
        const primaryUrl = getCleanPlaylistUrl(episodeUrl, fallbackUrl);
        const res = await fetch(primaryUrl);
        const text = await res.text();
        const trimmed = text.trim().toLowerCase();
        const isHtml = trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<head") || trimmed.startsWith("<body");

        if (!isHtml && res.ok) {
          const data = JSON.parse(text);
          if (data.success && Array.isArray(data.qualities) && data.qualities.length > 0) {
            if (isMounted) {
              let qualList: (string | number)[] = [...data.qualities];
              const isAniboom = episodeUrl.includes("aniboom") || preferredProvider === "aniboom";
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
        console.warn("Primary AniBoom resolution attempt failed, trying fallback:", primaryErr);
      }

      // Attempt 2: If primary failed and fallbackUrl exists, try fallback (Kodik)
      if (fallbackUrl && fallbackUrl !== episodeUrl) {
        try {
          const fallbackReqUrl = getCleanPlaylistUrl(fallbackUrl);
          const fRes = await fetch(fallbackReqUrl);
          const fText = await fRes.text();
          const fTrimmed = fText.trim().toLowerCase();
          const isFHtml = fTrimmed.startsWith("<!doctype") || fTrimmed.startsWith("<html") || fTrimmed.startsWith("<head") || fTrimmed.startsWith("<body");

          if (!isFHtml && fRes.ok) {
            const fData = JSON.parse(fText);
            if (fData.success && Array.isArray(fData.qualities) && fData.qualities.length > 0) {
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

      if (isMounted) {
        setError("Не удалось автоматически определить качества серии для загрузки. Попробуйте обновить страницу или скачайте серию через Telegram.");
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

  // Function to dynamically load mux.js from CDN
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
      script.onerror = () => reject(new Error("Ошибка загрузки конвертера видео (mux.js). Пожалуйста, отключите блокировщик скриптов или обновите страницу."));
      document.head.appendChild(script);
    });
  };

  const handleStartDownload = async (quality: string) => {
    if (downloading) return;
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
      // 1. Load video converter library (mux.js)
      setProgress({
        id: "client_download",
        stage: "loading_libs",
        processed: 0,
        total: 1,
        progress: 2,
        status: "running",
        fileName: outputFileName
      });
      await loadMuxJs();

      // 2. Fetch HLS playlist entries
      setProgress({
        id: "client_download",
        stage: "fetching_playlist",
        processed: 0,
        total: 1,
        progress: 5,
        status: "running",
        fileName: outputFileName
      });
      const playlistUrl = getCleanPlaylistUrl(activeUrl, fallbackUrl, quality);
      const playlistRes = await fetch(playlistUrl);
      
      const playlistText = await playlistRes.text();
      const trimmedText = playlistText.trim().toLowerCase();
      const isHtmlResponse = trimmedText.startsWith("<!doctype") || trimmedText.startsWith("<html") || trimmedText.startsWith("<head") || trimmedText.startsWith("<body");
      if (isHtmlResponse || !playlistRes.ok) {
        throw new Error("Не удалось загрузить видеофайл. Пожалуйста, откройте страницу в новой вкладке или скачайте серию через Telegram-бот ниже.");
      }

      // Parse segment URLs from M3U8 content
      const lines = playlistText.split("\n");
      const segmentUrls: string[] = [];
      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith("#")) {
          if (line.startsWith("/")) {
            segmentUrls.push(window.location.origin + line);
          } else if (!line.startsWith("http")) {
            segmentUrls.push(window.location.origin + "/api/media/" + line);
          } else {
            segmentUrls.push(line);
          }
        }
      }

      const total = segmentUrls.length;
      if (total === 0) {
        throw new Error("Не удалось извлечь фрагменты видео из плейлиста для скачивания.");
      }

      // 3. Download segments with concurrency pool
      setProgress({
        id: "client_download",
        stage: "downloading",
        processed: 0,
        total,
        progress: 10,
        status: "running",
        fileName: outputFileName
      });

      const concurrency = 8;
      const results = new Array<ArrayBuffer>(total);
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
            results[index] = buf;
            return;
          } catch (chunkErr) {
            console.warn(`Attempt ${attempt} failed for chunk index ${index}:`, chunkErr);
            if (attempt === maxAttempts) {
              throw new Error(`Ошибка загрузки фрагмента ${index + 1} из ${total}. Пожалуйста, перезапустите скачивание.`);
            }
            await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
          }
        }
      };

      const worker = async () => {
        while (activeIndex < total) {
          const currentIndex = activeIndex++;
          await downloadChunk(currentIndex, segmentUrls[currentIndex]);
          completedCount++;
          
          // Allocate 10% - 90% for progress bar
          const downloadProgressPercent = 10 + Math.round((completedCount / total) * 80);
          setProgress({
            id: "client_download",
            stage: "downloading",
            processed: completedCount,
            total,
            progress: downloadProgressPercent,
            status: "running",
            fileName: outputFileName
          });
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, total) }, worker);
      await Promise.all(workers);

      // 4. Muxing Stage (TS to MP4 Conversion in Browser)
      setProgress({
        id: "client_download",
        stage: "muxing",
        processed: total,
        total,
        progress: 95,
        status: "running",
        fileName: outputFileName
      });

      // Execute Transmuxing on the results array with custom options to align timestamps
      const transmuxer = new (window as any).muxjs.mp4.Transmuxer({
        baseMediaDecodeTime: 0,
        keepOriginalTimestamps: false
      });

      try {
        transmuxer.setBaseMediaDecodeTime(0);
      } catch (t_err) {
        console.warn("Could not set baseMediaDecodeTime directly:", t_err);
      }

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

      // Feed sequential downloaded segments to the transmuxer
      // NOTE: We do NOT call flush() inside the loop anymore! This ensures continuous track parsing,
      // preventing DTS/PTS drift and maintaining perfect audio/video synchronization across segment boundaries.
      for (let i = 0; i < results.length; i++) {
        if (results[i]) {
          transmuxer.push(new Uint8Array(results[i]));
        }
      }

      // Flush exactly once after concatenating all media content to construct final MP4 fragments
      transmuxer.flush();

      const finalInitSegment = remuxedInitSegment;
      if (!finalInitSegment) {
        throw new Error("Не удалось сгенерировать медиа-заголовки MP4. Поток поврежден или имеет несовместимый кодек.");
      }

      // Formulate complete MP4 bytes
      const mp4Buffer = new Uint8Array(finalInitSegment.byteLength + remuxedBytesLength);
      mp4Buffer.set(finalInitSegment, 0);

      let offset = finalInitSegment.byteLength;
      for (const seg of remuxedSegs) {
        mp4Buffer.set(seg, offset);
        offset += seg.byteLength;
      }

      const mp4Blob = new Blob([mp4Buffer], { type: "video/mp4" });
      const localUrl = URL.createObjectURL(mp4Blob);
      setLocalDownloadBlobUrl(localUrl);

      setProgress({
        id: "client_download",
        stage: "ready",
        processed: total,
        total,
        progress: 100,
        status: "success",
        fileName: outputFileName
      });

      // Trigger standard save
      const link = document.createElement("a");
      link.href = localUrl;
      link.setAttribute("download", outputFileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setDownloading(false);
    } catch (err: any) {
      console.error("Browser MP4 download failed:", err);
      setError(err.message || "Ошибка сборки .MP4");
      setDownloading(false);
      setProgress({
        id: "client_download",
        stage: "failed",
        processed: 0,
        total: 1,
        progress: 0,
        status: "failed",
        error: err.message || "Ошибка конвертации в MP4"
      });
    }
  };

  const getStageMessage = (stage: string) => {
    switch (stage) {
      case "loading_libs":
        return "Подготовка к началу загрузки...";
      case "fetching_playlist":
        return "Подготовка файлов серии...";
      case "downloading":
        return progress ? `Скачивание видеофайла (${progress.processed} из ${progress.total || "..."})...` : "Скачивание серии...";
      case "muxing":
        return "Завершение сборки видео...";
      case "ready":
        return "Видео успешно готово!";
      case "failed":
        return "Ошибка при загрузке";
      default:
        return "Подготовка к скачиванию...";
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 transition-all duration-300 space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs uppercase tracking-wider font-extrabold text-slate-300">
            Выберите качество для скачивания .MP4 в браузере:
          </label>
          {!loadingQualities && qualities.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold">
              {qualities.includes("1080") ? (
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
              Проверка доступных вариантов...
            </div>
          )}

          {error && (
            <div className="text-red-400 text-xs font-semibold flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl w-full">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
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
                  {qual}p (.mp4)
                </button>
              ))}
            </div>
          )}

          {!loadingQualities && qualities.length === 0 && !error && (
            <span className="text-slate-400 text-xs">Качество не определено</span>
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
              <p className="text-white font-bold text-sm">Серия успешно скачана!</p>
              <p className="text-slate-400 text-xs mt-0.5">Видео сохранено в формате .mp4 и готово к просмотру на любом плеере или телефоне.</p>
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
            Сохранить .mp4
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
                  Наш Telegram-бот поможет моментально получить нужную серию. Вы получите готовое видео высокого качества прямо в диалоге с ботом, которое удобно смотреть на телефонах (iPhone / Android), планшетах или компьютерах!
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
