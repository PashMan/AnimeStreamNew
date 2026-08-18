import React, { useState, useEffect, useRef } from "react";
import {
  useSearchParams,
  useParams,
  Link,
  useNavigate,
} from "react-router-dom";
import {
  Star,
  Heart,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Film,
  CheckCircle,
  Forward,
  MessageSquare,
  Users,
  Send,
  X,
  Link as LinkIcon,
  Check,
  Home as HomeIcon,
  Copy,
  Share2,
  AlertTriangle,
  Shield,
  Bell,
  RefreshCw,
  Search,
  Bot,
  Download,
  ArrowDownToLine,
  Mic,
  MicOff,
  Crown,
  Play,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  fetchAnimeDetails,
  fetchRelatedAnimes,
  fetchSimilarAnimes,
} from "../services/shikimori";
import { FALLBACK_IMAGE as PLACEHOLDER_IMAGE, MOCK_ANIME } from "../constants";
import { db, supabase } from "../services/db";
import { Anime, Comment, User, Review, StreamProvider } from "../types";
import { Image } from "../components/Image";
import AnimeCard from "../components/AnimeCard";
import SEO from "../components/SEO";
import ReviewSection from "../components/ReviewSection";
import { ReportModal } from "../components/ReportModal";
import { LazyRender } from "../components/LazyRender";
import { usePlayerSync } from "../hooks/usePlayerSync";
import { CustomPlayer, isTvDevice } from "../components/CustomPlayer";
import { BrowserDownloadWidget } from "../components/BrowserDownloadWidget";
import { useSlugBlocks } from "../store/slugBlocks";
import { useDmcaBlocks } from "../store/dmcaBlocks";
import { filterProfanity } from "../utils/profanity";

const formatWorkerEmbedUrl = (rawEmbedUrl: string, epNum: number) => {
  try {
    const url = new URL(rawEmbedUrl.startsWith("//") ? `https:${rawEmbedUrl}` : rawEmbedUrl);
    if (!url.searchParams.has("episode")) {
      url.searchParams.set("episode", String(epNum));
    }
    if (!url.searchParams.has("translation")) {
      url.searchParams.set("translation", "16");
    }
    return url.toString();
  } catch (_) {
    let result = rawEmbedUrl;
    if (!result.includes("episode=")) {
      result += (result.includes("?") ? "&" : "?") + `episode=${epNum}`;
    }
    if (!result.includes("translation=")) {
      result += (result.includes("?") ? "&" : "?") + `translation=16`;
    }
    return result;
  }
};

const getResolvedAniboomUrl = (t: any, epNum: number, defaultUrl?: string | null) => {
  const num = epNum || 1;
  let target: string | null = null;

  if (t?.aniboom_iframe) {
    target = t.aniboom_iframe;
  } else if (t?.iframe && t.iframe.includes("aniboom")) {
    target = t.iframe;
  } else if (defaultUrl && defaultUrl.includes("aniboom")) {
    target = defaultUrl;
  }

  if (!target) {
    return null;
  }

  try {
    const url = new URL(target.startsWith("//") ? `https:${target}` : target);
    url.searchParams.set("episode", String(num));
    // NOTE: Keep original translation parameter from Aniboom/AnimeGO target URL.
    // Do NOT overwrite with Kodik internal translation ID (t.id).
    if (!url.searchParams.has("translation")) {
      url.searchParams.set("translation", "16");
    }
    const resolved = url.toString();
    console.log(`🔥 [Aniboom Resolver] RESOLVED: ${resolved} | Ep: ${num} | Voice: ${t?.title || 'Default'}`);
    return resolved;
  } catch (_) {
    let result = target;
    if (!result.includes("episode=")) {
      result += (result.includes("?") ? "&" : "?") + `episode=${num}`;
    }
    if (!result.includes("translation=")) {
      result += (result.includes("?") ? "&" : "?") + `translation=16`;
    }
    console.log(`🔥 [Aniboom Resolver] RESOLVED (STRING): ${result}`);
    return result;
  }
};

const getResolvedKodikUrl = (t: any, epNum: number, defaultUrl?: string | null) => {
  const num = epNum || 1;
  const target = t?.kodik_iframe || (t?.iframe && !t.iframe.includes("collaps") && !t.iframe.includes("ortified") ? t.iframe : null) || defaultUrl;
  if (!target) return null;
  try {
    const url = new URL(target.startsWith("//") ? `https:${target}` : target);
    url.searchParams.set("episode", String(num));
    return url.toString();
  } catch (_) {
    const sep = target.includes("?") ? "&" : "?";
    return `${target}${sep}episode=${num}`;
  }
};

const getResolvedCollapsUrl = (t: any, epNum: number, defaultUrl?: string | null) => {
  const num = epNum || 1;
  const target = t?.collaps_iframe || (t?.iframe && (t.iframe.includes("collaps") || t.iframe.includes("ortified")) ? t.iframe : null) || defaultUrl;
  if (!target) return null;
  try {
    const url = new URL(target.startsWith("//") ? `https:${target}` : target);
    url.searchParams.set("episode", String(num));
    return url.toString();
  } catch (_) {
    const sep = target.includes("?") ? "&" : "?";
    return `${target}${sep}episode=${num}`;
  }
};

const getResolvedIframeUrl = (t: any, epNum: number, defaultUrl?: string | null) => {
  const num = epNum || 1;
  if (!t) {
    if (defaultUrl) {
      try {
        const url = new URL(defaultUrl.startsWith("//") ? `https:${defaultUrl}` : defaultUrl);
        url.searchParams.set("episode", String(num));
        return url.toString();
      } catch (_) {
        const sep = defaultUrl.includes("?") ? "&" : "?";
        return `${defaultUrl}${sep}episode=${num}`;
      }
    }
    return null;
  }

  if (defaultUrl && (defaultUrl.includes("collaps") || defaultUrl.includes("ortified"))) {
    return getResolvedCollapsUrl(t, num, defaultUrl);
  }

  if (
    t.collaps_iframe &&
    t.has_1080_collaps &&
    num <= (t.collaps_episodes_count || 1)
  ) {
    return getResolvedCollapsUrl(t, num, defaultUrl);
  }

  const fallbackIframe = t.kodik_iframe || (t.iframe && !t.iframe.includes("collaps") && !t.iframe.includes("ortified") ? t.iframe : null) || t.collaps_iframe || defaultUrl;
  if (fallbackIframe) {
    try {
      const url = new URL(fallbackIframe.startsWith("//") ? `https:${fallbackIframe}` : fallbackIframe);
      url.searchParams.set("episode", String(num));
      return url.toString();
    } catch (_) {
      const sep = fallbackIframe.includes("?") ? "&" : "?";
      return `${fallbackIframe}${sep}episode=${num}`;
    }
  }

  return null;
};
import { generateAnimeSEO } from "../utils/seoGenerator";

const Details: React.FC = () => {
  const params = useParams<{ id: string; "*": string }>();
  const paramId = params.id;
  const starParam = params["*"];
  const paramEpisode = starParam?.startsWith("episode/")
    ? starParam.split("episode/")[1]?.split("/")[0]
    : undefined;
  // Extract numeric ID from the start of the string (e.g. "123-anime-slug" -> "123")
  const id = paramId ? parseInt(paramId).toString() : undefined;

  const { slugBlocks } = useSlugBlocks();
  const { dmcaBlocks } = useDmcaBlocks();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { openAuthModal, user } = useAuth();
  const relatedRef = useRef<HTMLDivElement>(null);
  const similarRef = useRef<HTMLDivElement>(null);

  const [anime, setAnime] = useState<Anime | null>(null);
  const [selectedPlayer, setSelectedPlayer] =
    useState<string>("KamiPlayer (1080p)");
  const [players, setPlayers] = useState<
    { name: string; iframe: string | null; isCustom?: boolean }[]
  >([{ name: "KamiPlayer (1080p)", iframe: null, isCustom: true }]);
  const [translations, setTranslations] = useState<
    { id: string | number; title: string; type: string; iframe: string; episodes_count?: number; last_episode?: number }[]
  >([]);
  const [selectedTranslation, setSelectedTranslation] = useState<{
    id: string | number;
    title: string;
    type: string;
    iframe: string;
    episodes_count?: number;
    last_episode?: number;
  } | null>(null);
  const [hasFetchedPlayers, setHasFetchedPlayers] = useState(false);
  const [isPlayersLoading, setIsPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [related, setRelated] = useState<{ relation: string; anime: Anime }[]>(
    [],
  );
  const [similar, setSimilar] = useState<Anime[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userComment, setUserComment] = useState("");
  const [watchedEpisodes, setWatchedEpisodes] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isMainLoading, setIsMainLoading] = useState(true);
  const [isRelatedLoading, setIsRelatedLoading] = useState(true);
  const [isSimilarLoading, setIsSimilarLoading] = useState(true);
  const [isReviewsLoading, setIsReviewsLoading] = useState(true);
  const [isCommentsLoading, setIsCommentsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFavorite, setIsFavorite] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isRelatedExpanded, setIsRelatedExpanded] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [epSearchVal, setEpSearchVal] = useState("");
  const [isNotifierOpen, setIsNotifierOpen] = useState(false);

  // Stream Resolution State for Aniboom
  const [resolvedStream, setResolvedStream] = useState<{
    url: string;
    streamType: "dash" | "hls";
    provider: StreamProvider;
  } | null>(null);
  const [isResolvingStream, setIsResolvingStream] = useState(false);
  const [streamResolutionError, setStreamResolutionError] = useState<string | null>(null);
  const [downloadProvider, setDownloadProvider] = useState<"aniboom" | "kodik" | "collaps">("aniboom");

  const [translationQualityOverrides, setTranslationQualityOverrides] = useState<Record<string, string>>({});

  const getCleanTitle = (title: string) => {
    return (title || "").replace(/\s*\((4K|1080|720|4к|1080p|720p)\)\s*/gi, "").trim();
  };

  const getTranslationQuality = (t: any) => {
    if (!t) return "1080p";
    if (t.quality_label) return t.quality_label;
    const baseTitle = getCleanTitle(t.title || "");
    const override = translationQualityOverrides[baseTitle];
    if (override) return override;
    const match = (t.title || "").match(/\b(4K|1080|720)\b/i);
    if (match) return match[0].toUpperCase() === "4K" ? "4K" : `${match[0]}p`;
    return "1080p";
  };

  const getDisplayTitle = (title: string) => {
    return getCleanTitle(title);
  };

  // Log active player tab selection to console
  useEffect(() => {
    if (selectedPlayer) {
      console.log(
        `%c[Player Switch]%c Выбран плеер в интерфейсе: %c ${selectedPlayer} %c`,
        "background: #1e1b4b; color: #a78bfa; font-weight: bold; padding: 3px 6px; border-radius: 4px 0 0 4px;",
        "background: #3730a3; color: #ffffff; padding: 3px 6px;",
        "background: #4f46e5; color: #ffffff; font-weight: bold; padding: 3px 8px; border-radius: 3px;",
        "background: #1e1b4b; padding: 3px;"
      );
    }
  }, [selectedPlayer]);

  // Smoothly resolve AniBoom streams via Cloudflare Worker microservice (D1 database) with instant Kodik fallback
  useEffect(() => {
    const isSuzume = id === "50594" || id === "62568";
    const isWeathering = id === "38826";
    const isGardenOfWords = id === "16782";
    const isKimiNoNaWa = id === "32281";
    const isNative1080 = isSuzume || isWeathering || isGardenOfWords || isKimiNoNaWa;

    if ((selectedPlayer !== "KamiPlayer (1080p)" && selectedPlayer !== "Aniboom") || isNative1080) {
      setResolvedStream(null);
      setIsResolvingStream(false);
      return;
    }

    let isCurrent = true;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 8500);

    const resolveAniboomStream = async () => {
      setIsResolvingStream(true);
      setStreamResolutionError(null);
      setResolvedStream(null);

      const epNum = parseInt(paramEpisode || "1") || 1;
      const defaultKodik = players.find((p) => p.name === "Kodik")?.iframe;
      const kodikIframeUrl = getResolvedKodikUrl(selectedTranslation, epNum, defaultKodik);

      try {
        const workerUrl = `https://parser.oshxycfdjab.workers.dev/?shikimori_id=${id}&episode=${epNum}`;
        console.log(`📡 [Worker Resolver] Fetching stream from Cloudflare Worker for Shikimori ID: ${id}, Ep: ${epNum}`);

        const res = await fetch(workerUrl, {
          signal: abortController.signal
        });

        if (!res.ok) {
          throw new Error(`Worker returned HTTP status ${res.status}`);
        }

        const data = await res.json();
        console.log(`📦 [Worker Resolver] Response:`, data);

        if (data && data.source === "aniboom" && data.embed_url) {
          if (isCurrent) {
            const formattedEmbedUrl = formatWorkerEmbedUrl(data.embed_url, epNum);
            const playlistUrl = `/api/media/playlist?url=${encodeURIComponent(formattedEmbedUrl)}${
              kodikIframeUrl ? `&fallback_url=${encodeURIComponent(kodikIframeUrl)}` : ""
            }`;

            setResolvedStream({
              url: playlistUrl,
              streamType: "hls",
              provider: "aniboom"
            });
            setIsResolvingStream(false);
            console.log(`✅ [Worker Resolver] Aniboom stream activated (KamiPlayer 1080p): ${formattedEmbedUrl}`);
          }
          return;
        }

        // If worker returns kodik_fallback or unknown format
        console.info(`🔄 [Worker Resolver] Worker returned ${data?.source || "fallback"} (${data?.reason || "catalog"}). Switching to Kodik.`);
        if (isCurrent) {
          if (kodikIframeUrl) {
            setResolvedStream({
              url: `/api/media/playlist?url=${encodeURIComponent(kodikIframeUrl)}`,
              streamType: "hls",
              provider: "kodik"
            });
            setIsResolvingStream(false);
          } else {
            setIsResolvingStream(false);
            handleAniboomFallback();
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.warn("⏱️ [Worker Resolver] Request timed out (8.5s limit) or aborted. Falling back to Kodik.");
        } else {
          console.info("ℹ️ [Worker Resolver] Worker note:", err.message);
        }

        if (isCurrent) {
          if (kodikIframeUrl) {
            setResolvedStream({
              url: `/api/media/playlist?url=${encodeURIComponent(kodikIframeUrl)}`,
              streamType: "hls",
              provider: "kodik"
            });
            setIsResolvingStream(false);
          } else {
            setIsResolvingStream(false);
            setStreamResolutionError(err.message || "Failed to resolve stream");
            handleAniboomFallback();
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const handleAniboomFallback = () => {
      // Smooth fallback sequence: try to find Kodik, then Collaps, or any other source
      const kodik = players.find((p) => p.name === "Kodik");
      const collaps = players.find((p) => p.name === "Collaps" || (p.iframe && p.iframe.includes("collaps")));
      const anyOther = players.find((p) => p.name !== "KamiPlayer (1080p)" && p.name !== "Aniboom");

      if (kodik) {
        console.log("🔄 [Aniboom Resolver] Falling back smoothly to Kodik");
        setSelectedPlayer("Kodik");
      } else if (collaps) {
        console.log("🔄 [Aniboom Resolver] Falling back smoothly to Collaps");
        setSelectedPlayer(collaps.name);
      } else if (anyOther) {
        console.log(`🔄 [Aniboom Resolver] Falling back smoothly to ${anyOther.name}`);
        setSelectedPlayer(anyOther.name);
      } else {
        console.warn("⚠️ [Aniboom Resolver] No fallback player available.");
      }
    };

    resolveAniboomStream();

    return () => {
      isCurrent = false;
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [selectedPlayer, paramEpisode, selectedTranslation, id, players]);

  // Auto scroll to active episode on change
  useEffect(() => {
    const activeEp = paramEpisode || "1";
    const timer = setTimeout(() => {
      const element = document.getElementById(`episode-btn-${activeEp}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [paramEpisode]);

  // Load watched history on mount/anime change
  useEffect(() => {
    if (paramId) {
      try {
        const key = `anime_watched_${paramId}`;
        const stored = localStorage.getItem(key);
        setWatchedEpisodes(stored ? JSON.parse(stored) : []);
      } catch {
        setWatchedEpisodes([]);
      }
    }
  }, [paramId]);

  const markAsWatched = (epNum: string) => {
    if (paramId && epNum) {
      try {
        const key = `anime_watched_${paramId}`;
        const stored = localStorage.getItem(key);
        const watched: string[] = stored ? JSON.parse(stored) : [];
        if (!watched.includes(epNum)) {
          const updated = [...watched, epNum];
          localStorage.setItem(key, JSON.stringify(updated));
          setWatchedEpisodes(updated);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Listen to message events from iframes (PlayerJS API / Kodik) and CustomPlayer custom events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload) {
          let currentTime = 0;
          let duration = 0;

          if (payload.event === 'time') {
            currentTime = Number(payload.value);
            duration = Number(payload.data);
          } else if (payload.key === 'kodik_player_video_info' && payload.value) {
            currentTime = Number(payload.value.time);
            duration = Number(payload.value.duration);
          }

          if (duration > 0 && currentTime > 0) {
            const ratio = currentTime / duration;
            if (ratio >= 0.60) {
              markAsWatched(paramEpisode || "1");
            }
          }
        }
      } catch (_) {
        // Ignored
      }
    };

    const handleCustomWatch = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.animeId === paramId) {
        markAsWatched(customEvent.detail.episode);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('anime_episode_watched' as any, handleCustomWatch);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('anime_episode_watched' as any, handleCustomWatch);
    };
  }, [paramId, paramEpisode]);

  const [roomId, setRoomId] = useState<string | null>(searchParams.get("room"));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const isCustomPlayer =
    players.find((p) => p.name === selectedPlayer)?.isCustom || false;
  const {
    role,
    usersCount,
    myId,
    sync,
    hostState,
    isVoiceMuted,
    toggleVoiceMute,
    joinedUsers = [],
    voiceError,
  } = usePlayerSync(
    roomId,
    iframeRef,
    nativeVideoRef,
    isCustomPlayer,
  );

  const [isRoomInstructionOpen, setIsRoomInstructionOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);

  useEffect(() => {
    if (roomId) {
      const hasSeenInstruction = sessionStorage.getItem(
        `seen_room_instruction_${roomId}`,
      );
      if (!hasSeenInstruction) {
        setIsRoomInstructionOpen(true);
        sessionStorage.setItem(`seen_room_instruction_${roomId}`, "true");
      }
    }
  }, [roomId]);

  // Redirect to episode 1 if no episode is selected in URL to keep visual match across players
  useEffect(() => {
    if (!paramEpisode && id && anime) {
      const totalEpisodes = (selectedTranslation?.last_episode || selectedTranslation?.episodes_count) || anime.episodesAired || anime.episodes || 1;
      if (totalEpisodes > 0) {
        let newUrl = `/anime/${paramId}/episode/1`;
        if (window.location.search) {
          newUrl += window.location.search;
        }
        navigate(newUrl, { replace: true });
      }
    }
  }, [paramEpisode, id, paramId, anime, navigate]);

  const handleCreateRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 10);
    setRoomId(newRoomId);
    setSearchParams(
      (prev) => {
        prev.set("room", newRoomId);
        return prev;
      },
      { replace: true },
    );
  };

  // Lazy loading states
  const [shouldLoadRelated, setShouldLoadRelated] = useState(false);
  const [shouldLoadSimilar, setShouldLoadSimilar] = useState(false);
  const [shouldLoadReviews, setShouldLoadReviews] = useState(false);
  const [shouldLoadComments, setShouldLoadComments] = useState(false);

  // Share feature
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [friendsList, setFriendsList] = useState<User[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: "comment" | "review";
    id: string;
    content?: string;
    link?: string;
  } | null>(null);

  const lastLoadedId = useRef<string | null>(null);

  useEffect(() => {
    if (isShareModalOpen && user?.friends && user.friends.length > 0) {
      setIsLoadingFriends(true);
      db.getFriendsList(user.friends)
        .then(setFriendsList)
        .catch(console.error)
        .finally(() => setIsLoadingFriends(false));
    }
  }, [isShareModalOpen, user?.friends]);

  const [animeStatus, setAnimeStatus] = useState<
    "watched" | "watching" | "dropped" | "planned" | "none"
  >("none");
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStatusDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedPlayer) return;
    const ep = paramEpisode || "1";
    const tr = selectedTranslation?.title || "По умолчанию";
    if (selectedPlayer === "KamiPlayer") {
      console.log(`🎬 [Player Engine] ACTIVE PLAYER: KamiPlayer (Кастомный Artplayer) | Источник: Aniboom HLS Stream Parser | Серия: ${ep} | Озвучка: ${tr}`);
    } else if (selectedPlayer === "Collaps") {
      console.log(`🎬 [Player Engine] ACTIVE PLAYER: Collaps Embed (/api/collaps/embed) | Источник: Collaps | Серия: ${ep} | Озвучка: ${tr}`);
    } else if (selectedPlayer === "Kodik") {
      console.log(`🎬 [Player Engine] ACTIVE PLAYER: Kodik Standard Iframe | Источник: Kodik | Серия: ${ep} | Озвучка: ${tr}`);
    } else {
      console.log(`🎬 [Player Engine] ACTIVE PLAYER: ${selectedPlayer} | Серия: ${ep} | Озвучка: ${tr}`);
    }
  }, [selectedPlayer, selectedTranslation, paramEpisode]);

  useEffect(() => {
    let isMounted = true;
    const loadDetails = async () => {
      if (!id) return;

      // If we already loaded this anime, only update user-specific data if user changed
      if (lastLoadedId.current === id) {
        if (user?.email) {
          db.getProfile(user.email).then((profile) => {
            if (isMounted && profile) {
              let status:
                | "watched"
                | "watching"
                | "dropped"
                | "planned"
                | "none" = "none";
              if (profile.watchedAnimeIds?.includes(id)) status = "watched";
              else if (profile.watchingAnimeIds?.includes(id))
                status = "watching";
              else if (profile.droppedAnimeIds?.includes(id))
                status = "dropped";

              if (status === "none") {
                db.getFavorites(user.email).then((favs) => {
                  if (isMounted) {
                    if (favs.includes(id)) setAnimeStatus("planned");
                    else setAnimeStatus("none");
                  }
                });
              } else {
                setAnimeStatus(status);
              }
            }
          });
        } else {
          setAnimeStatus("none");
        }
        return;
      }

      lastLoadedId.current = id;

      // Reset states
      setIsMainLoading(true);
      setError(null);
      setIsRelatedLoading(true);
      setIsSimilarLoading(true);
      setIsReviewsLoading(true);
      setIsCommentsLoading(true);
      setAnime(null);
      setRelated([]);
      setSimilar([]);
      setReviews([]);
      setComments([]);
      setIsDescriptionExpanded(false);
      setPlayers([{ name: "KamiPlayer (1080p)", iframe: null, isCustom: true }]);
      setTranslations([]);
      setSelectedTranslation(null);
      setHasFetchedPlayers(false);
      setSelectedPlayer("KamiPlayer (1080p)");

      // Reset lazy load triggers
      setShouldLoadRelated(false);
      setShouldLoadSimilar(false);
      setShouldLoadReviews(false);
      setShouldLoadComments(false);

      try {
        // 1. Critical Path: Main Details
        let data = await fetchAnimeDetails(id);

        if (!isMounted) return;

        if (!data) {
          console.warn(
            `[Details] API failed for ID ${id}, using fallback mock data`,
          );
          const mock = MOCK_ANIME.find((a) => a.id === id) || MOCK_ANIME[0];
          data = {
            ...mock,
            id: id,
            title: mock.title || "Аниме",
            description: mock.description || "Описание временно недоступно",
            image: mock.image || PLACEHOLDER_IMAGE,
            cover: mock.cover || PLACEHOLDER_IMAGE,
            genres: mock.genres || [],
            rating: mock.rating || 0,
            year: mock.year || new Date().getFullYear(),
            type: mock.type || "TV Series",
            status: mock.status || "Released",
            episodes: mock.episodes || 0,
            episodesAired: mock.episodesAired || 0,
            studio: mock.studio || "Unknown",
            slug: mock.slug || "",
            originalName: mock.originalName || "",
          };
        }

        setAnime(data);
        setIsMainLoading(false);

        // Fetch DMCA blocks
        db.getDmcaBlocks()
          .then((blocks) => {
            if (
              isMounted &&
              blocks.includes(id) &&
              !paramId?.endsWith("-watch")
            ) {
              setIsBlocked(true);
            }
          })
          .catch(console.error);

        // Fetch Slug blocks
        db.getSlugBlocks()
          .then((blocks) => {
            if (
              isMounted &&
              blocks.includes(id) &&
              paramId?.includes("-") &&
              !paramId?.endsWith("-watch")
            ) {
              setIsBlocked(true);
            }
          })
          .catch(console.error);

        // User specific data (Favorites/Watched) - can be done in parallel with lazy load
        if (user?.email) {
          Promise.all([db.getFavorites(user.email), db.getProfile(user.email)])
            .then(([favs, profile]) => {
              if (isMounted && profile) {
                setIsFavorite(favs.includes(id));
                setIsWatched(profile.watchedAnimeIds?.includes(id) || false);

                let status:
                  | "watched"
                  | "watching"
                  | "dropped"
                  | "planned"
                  | "none" = "none";
                if (profile.watchedAnimeIds?.includes(id)) status = "watched";
                else if (profile.watchingAnimeIds?.includes(id))
                  status = "watching";
                else if (profile.droppedAnimeIds?.includes(id))
                  status = "dropped";
                else if (favs.includes(id)) status = "planned";

                setAnimeStatus(status);
              }
            })
            .catch((err) => console.error("User data fetch error", err));
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Details Page Load Error:", err);
        setError(err.message || "Произошла ошибка при загрузке");
        setIsMainLoading(false);
      }
    };
    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [id, user?.email]);

  // Lazy Load Effects
  useEffect(() => {
    if (shouldLoadRelated && id && related.length === 0) {
      fetchRelatedAnimes(id)
        .then((relatedData) => {
          const filteredRelated = relatedData.filter(
            (item) => !["Музыка", "Music"].includes(item.relation),
          );
          const priorityRelations = [
            "Продолжение",
            "Предыстория",
            "Sequel",
            "Prequel",
            "Фильм",
            "Movie",
          ];
          const sortedRelated = [...filteredRelated].sort((a, b) => {
            const aPri = priorityRelations.indexOf(a.relation);
            const bPri = priorityRelations.indexOf(b.relation);
            if (aPri !== -1 && bPri === -1) return -1;
            if (aPri === -1 && bPri !== -1) return 1;
            if (aPri !== -1 && bPri !== -1) return aPri - bPri;
            const typeOrder: Record<string, number> = {
              "TV Series": 1,
              Movie: 2,
              OVA: 3,
              ONA: 4,
            };
            const aType = typeOrder[a.anime.type] || 5;
            const bType = typeOrder[b.anime.type] || 5;
            if (aType !== bType) return aType - bType;
            return 0;
          });
          setRelated(sortedRelated);
        })
        .catch((err) => {
          if (err.name !== "AbortError" && !err.message?.includes("aborted"))
            console.error("Related fetch error", err);
        })
        .finally(() => setIsRelatedLoading(false));
    }
  }, [shouldLoadRelated, id]);

  useEffect(() => {
    if (shouldLoadSimilar && id && similar.length === 0) {
      fetchSimilarAnimes(id)
        .then((similarData) => {
          setSimilar(similarData);
        })
        .catch((err) => {
          if (err.name !== "AbortError" && !err.message?.includes("aborted"))
            console.error("Similar fetch error", err);
        })
        .finally(() => setIsSimilarLoading(false));
    }
  }, [shouldLoadSimilar, id]);

  useEffect(() => {
    if (shouldLoadReviews && id && reviews.length === 0) {
      db.getAnimeReviews(id)
        .then(setReviews)
        .catch((err) => {
          if (err.name !== "AbortError" && !err.message?.includes("aborted"))
            console.error("Reviews fetch error", err);
        })
        .finally(() => setIsReviewsLoading(false));
    }
  }, [shouldLoadReviews, id]);

  useEffect(() => {
    if (shouldLoadComments && id && comments.length === 0) {
      db.getUserComments(id)
        .then(setComments)
        .catch((err) => {
          if (err.name !== "AbortError" && !err.message?.includes("aborted"))
            console.error("Comments fetch error", err);
        })
        .finally(() => setIsCommentsLoading(false));
    }
  }, [shouldLoadComments, id]);

  // Listen to Kodik player messages to update URL when episode changes and auto-update list status
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        if (!event.data) return;

        let pEpisode: any = null;
        let isStarted = false;
        let isEnded = false;

        if (
          event.data.key === "kodik_player_message" ||
          event.data.key === "kodik_player_api"
        ) {
          const { value } = event.data;
          if (value) {
            if (value.episode) pEpisode = value.episode;
            if (value.kodik_player_play || value.event === "play")
              isStarted = true;
            if (
              value.kodik_player_time_update ||
              value.event === "timeupdate"
            ) {
              const time =
                typeof value.time === "number"
                  ? value.time
                  : typeof value.seconds === "number"
                    ? value.seconds
                    : typeof value.kodik_player_time_update === "number"
                      ? value.kodik_player_time_update
                      : 0;
              if (time > 15) isStarted = true;
            }
          }
        } else if (
          typeof event.data.key === "string" &&
          event.data.key.startsWith("kodik_player")
        ) {
          if (event.data.key === "kodik_player_play") isStarted = true;
          if (event.data.key === "kodik_player_video_ended") isEnded = true;
          if (
            event.data.key === "kodik_player_time_update" &&
            typeof event.data.value === "number" &&
            event.data.value > 15
          )
            isStarted = true;
        } else if (typeof event.data === "string") {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.event === "play") isStarted = true;
            if (parsed.event === "ended") isEnded = true;
            if (
              parsed.event === "timeupdate" &&
              ((typeof parsed.time === "number" && parsed.time > 15) ||
                (typeof parsed.value === "number" && parsed.value > 15))
            )
              isStarted = true;
          } catch (e) {}
        }

        const currentEpisodeStr =
          document.location.pathname.split("/episode/")[1] || pEpisode;

        if (pEpisode) {
          let newUrl = `/anime/${id}/episode/${pEpisode}`;
          // Preserve query parameters, especially ?room=
          if (window.location.search) {
            newUrl += window.location.search;
          }
          if (window.location.pathname !== `/anime/${id}/episode/${pEpisode}`) {
            window.history.replaceState(null, "", newUrl);
          }
        }

        // Automatically update the user lists based on watch activity
        if (user?.email && anime && id) {
          const totalEpisodes = (selectedTranslation?.last_episode || selectedTranslation?.episodes_count) || anime.episodesAired || anime.episodes || 0;

          if (
            isStarted &&
            animeStatus !== "watching" &&
            animeStatus !== "watched"
          ) {
            setAnimeStatus("watching");
            db.setAnimeStatus(user.email, id.toString(), "watching").catch(
              console.error,
            );
          }

          if (isEnded && currentEpisodeStr && totalEpisodes > 0) {
            const epNum = parseInt(currentEpisodeStr.toString());

            // Check if it's the final episode
            if (epNum === totalEpisodes && animeStatus !== "watched") {
              setAnimeStatus("watched");
              setIsWatched(true);
              db.setAnimeStatus(user.email, id.toString(), "watched").catch(
                console.error,
              );
            } else {
              // Just finished an intermediate episode
              // Update Shiki with the new episode count!
              fetch("/api/shikimori/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: user.email,
                  animeId: id.toString(),
                  status: "watching",
                  episodes: epNum,
                }),
              }).catch((e) => console.error(e));
            }
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [id, user?.email, anime, animeStatus]);

  const handleFavorite = async () => {
    if (!user?.email) {
      openAuthModal();
      return;
    }
    setIsActionLoading(true);
    const newState = await db.toggleFavorite(user.email, id!);
    setIsFavorite(newState);
    setIsActionLoading(false);
  };

  const handleWatched = async () => {
    if (!user?.email) {
      openAuthModal();
      return;
    }
    setIsActionLoading(true);
    const newState = await db.toggleWatched(user.email, id!);
    setIsWatched(newState);
    setIsActionLoading(false);
  };

  const handleShareToFriend = async (friendEmail: string) => {
    if (!user?.email || !anime) return;
    setIsSharing(true);
    try {
      const animeUrl = window.location.href;
      const message = `Привет! Посмотри это аниме: ${anime.title}\n${animeUrl}`;
      await db.sendPrivateMessage(user.email, friendEmail, message);
      alert("Ссылка отправлена другу!");
    } catch (e) {
      alert("Ошибка при отправке сообщения");
    } finally {
      setIsSharing(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    if (!userComment.trim()) return;
    setIsCommenting(true);
    try {
      const newComment = await db.addComment(id!, user, userComment);
      setComments([newComment, ...comments]);
      setUserComment("");
    } catch (err: any) {
      alert(err.message || "Произошла ошибка при отправке комментария");
    } finally {
      setIsCommenting(false);
    }
  };

  const handleStatusChange = async (
    status: "watched" | "watching" | "dropped" | "planned" | "none",
  ) => {
    if (!user?.email) {
      openAuthModal();
      return;
    }
    setIsActionLoading(true);
    const success = await db.setAnimeStatus(user.email, id!, status);
    if (success) {
      setAnimeStatus(status);
      setIsFavorite(status === "planned");
      setIsWatched(status === "watched");
    }
    setIsActionLoading(false);
    setIsStatusDropdownOpen(false);
  };

  const scrollSlider = (
    ref: React.RefObject<HTMLDivElement>,
    direction: "left" | "right",
  ) => {
    if (ref.current) {
      const amount = direction === "left" ? -400 : 400;
      ref.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  useEffect(() => {
    setHasFetchedPlayers(false);
    setPlayersError(null);
  }, [paramEpisode]);

  useEffect(() => {
    if (!hasFetchedPlayers && !isPlayersLoading && !playersError && anime) {
      const fetchPlayers = async () => {
        setIsPlayersLoading(true);
        setPlayersError(null);
        try {
          const title = anime.originalName || anime.title;
          const year = anime.year || 0;

          const { fetchPlayersClientSide } =
            await import("../services/balancer");
          const data = await fetchPlayersClientSide(
            anime.id,
            title,
            year.toString(),
          );

          // Keep Kodik available for selection and smooth fallback
          const playersList = data?.players || [];
          const translationsList = data?.kodik_translations || [];

          if (playersList.length > 0) {
            // Append episode to iframe URLs if paramEpisode exists
            if (paramEpisode) {
              playersList.forEach((p) => {
                if (p.iframe) {
                  const separator = p.iframe.includes("?") ? "&" : "?";
                  p.iframe = `${p.iframe}${separator}episode=${paramEpisode}`;
                }
              });
              translationsList.forEach((t) => {
                if (t.iframe) {
                  const separator = t.iframe.includes("?") ? "&" : "?";
                  t.iframe = `${t.iframe}${separator}episode=${paramEpisode}`;
                }
              });
            }
            setPlayers(playersList);
            setTranslations(translationsList);
            if (translationsList.length > 0) {
              const matchedTranslation = selectedTranslation
                ? translationsList.find((t: any) => t.title === selectedTranslation.title)
                : null;
              setSelectedTranslation(matchedTranslation || translationsList[0]);
            }
            setHasFetchedPlayers(true);
            const isTv = isTvDevice();
            const customPlayer = playersList.find((p) => p.isCustom);
            const kodikPlayer = playersList.find((p) => p.name === "Kodik");
            
            const isCurrentPlayerValid = selectedPlayer && playersList.some((p) => p.name === selectedPlayer);
            
            if (isCurrentPlayerValid) {
              // Keep currently selected player to prevent jarring resets on episode/translation change
            } else if (isTv && kodikPlayer) {
              // TV browsers often prefer standard iframe playback for maximum hardware acceleration
              setSelectedPlayer("Kodik");
            } else if (customPlayer) {
              setSelectedPlayer(customPlayer.name);
            } else if (playersList.length > 0) {
              setSelectedPlayer(playersList[0].name);
            } else {
              setSelectedPlayer("KamiPlayer (1080p)");
            }
          } else {
            setHasFetchedPlayers(true);
            throw new Error("Плееры не найдены");
          }
        } catch (err: any) {
          if (err.message !== "Плееры не найдены") {
            console.error("Balancer Error:", err);
          }
          setPlayersError(err.message || "Ошибка загрузки плееров");
        } finally {
          setIsPlayersLoading(false);
        }
      };

      fetchPlayers();
    }
  }, [anime, hasFetchedPlayers, isPlayersLoading, playersError, paramEpisode]);

  if (isMainLoading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  if (error || !anime)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
        <h2 className="text-3xl font-black text-white mb-4">
          Не удалось загрузить аниме
        </h2>
        <p className="text-slate-400 mb-8 max-w-md">
          Возможно, сервер Shikimori перегружен. Попробуйте обновить страницу
          через пару секунд.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/80 transition-colors"
        >
          Обновить страницу
        </button>
      </div>
    );

  const isYourName = id === "32281";
  const isSuzume = id === "50594";
  const isWeathering = id === "38826";
  const isGardenOfWords = id === "16782";

  const generatedSEO = generateAnimeSEO(
    anime.title,
    anime.originalName || "",
    anime.year || "",
    anime.genres || [],
    anime.description || "",
    paramEpisode
  );

  const seoTitle = isYourName
    ? `Смотреть Твоё имя (Kimi no Na wa) в 4K онлайн бесплатно`
    : isSuzume
      ? `Смотреть Судзумэ, закрывающая двери (Suzume no Tojimari) в 4K онлайн бесплатно`
      : isWeathering
        ? `Смотреть Дитя погоды (Tenki no Ko) в 4K онлайн бесплатно`
        : isGardenOfWords
          ? `Смотреть Сад изящных слов (Kotonoha no Niwa) в 4K онлайн бесплатно`
          : generatedSEO.title;

  const seoDescription = isYourName
    ? `Смотреть аниме Твоё имя (Kimi no Na wa) в ультра-высоком качестве 4K (UHD) онлайн бесплатно. Потрясающая детализация шедевра Макото Синкая без рекламы.`
    : isSuzume
      ? `Смотреть аниме Судзумэ, закрывающая двери (Suzume no Tojimari) в ультра-высоком качестве 4K (UHD) онлайн бесплатно. Насладитесь потрясающей детализацией шедевра Макото Синкая в 2160p без рекламы.`
      : isWeathering
        ? `Смотреть аниме Дитя погоды (Tenki no Ko) в ультра-высоком качестве 4K (UHD) онлайн бесплатно. Насладитесь потрясающей детализацией шедевра Макото Синкая в 2160p без рекламы.`
        : isGardenOfWords
          ? `Смотреть аниме Сад изящных слов (Kotonoha no Niwa) в ультра-высоком качестве 4K (UHD) онлайн бесплатно. Насладитесь потрясающей детализацией шедевра Макото Синкая в 2160p без рекламы.`
          : generatedSEO.description;

  const seoKeywords = isYourName
    ? `смотреть твоё имя в 4к, твое имя 4k онлайн, kimi no na wa 4k, макото синкай твое имя 4к, смотреть аниме в 4к, ${anime.title}, ${anime.originalName}`
    : isSuzume
      ? `смотреть судзумэ в 4к, судзумэ закрывающая двери 4k онлайн, suzume no tojimari 4k, макото синкай судзумэ 4к, смотреть аниме в 4к, 2160p, uhd, ${anime.title}, ${anime.originalName}`
      : isWeathering
        ? `смотреть дитя погоды в 4к, дитя погоды 4k онлайн, tenki no ko 4k, макото синкай дитя погоды 4к, смотреть аниме в 4к, 2160p, uhd, ${anime.title}, ${anime.originalName}`
        : isGardenOfWords
          ? `смотреть сад изящных слов в 4к, сад изящных слов 4k онлайн, kotonoha no niwa 4k, макото синкай сад изящных слов 4к, смотреть аниме в 4к, 2160p, uhd, ${anime.title}, ${anime.originalName}`
          : generatedSEO.keywords;

  const isHentai =
    anime.ageRating === "rx" ||
    anime.genres.some(
      (g) =>
        g.toLowerCase() === "hentai" ||
        g.toLowerCase() === "хентай" ||
        g.toLowerCase() === "эччи" ||
        g.toLowerCase() === "ecchi" ||
        g.toLowerCase() === "yaoi" ||
        g.toLowerCase() === "yuri" ||
        g.toLowerCase() === "яой" ||
        g.toLowerCase() === "юри",
    );

  if (isHentai) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <SEO title="Страница не найдена" noindex={true} />
        <h1 className="text-6xl font-black text-white mb-4">404</h1>
        <p className="text-slate-400 mb-8">
          Эта страница была удалена или недоступна.
        </p>
        <Link
          to="/"
          className="px-8 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/80 transition-colors"
        >
          На главную
        </Link>
      </div>
    );
  }

  // Dynamic video URL construction for SEO / Schema
  let schemaVideoUrl = "";
  if (anime) {
    const isSuzume = id === "50594" || id === "62568";
    const isWeathering = id === "38826";
    const isGardenOfWords = id === "16782";
    const isKimiNoNaWa = id === "32281";

    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://kamianime.club";

    if (isSuzume || isWeathering || isGardenOfWords || isKimiNoNaWa) {
      const customRawSrc = isSuzume
        ? "https://cdn1.kamianime.club/suzume/master.m3u8"
        : isWeathering
          ? "https://cdn1.kamianime.club/weathering/master.m3u8"
          : isGardenOfWords
            ? "https://cdn1.kamianime.club/garden_of_words/master.m3u8"
            : "https://cdn.kamianime.club/kimi-no-na-wa/master.m3u8";
      schemaVideoUrl = `${origin}/api/proxy-4k?url=${encodeURIComponent(customRawSrc)}`;
    } else {
      const epNum = parseInt(paramEpisode || "1") || 1;
      const defaultKodik = players.find((p) => p.name === "Kodik")?.iframe;
      const resolvedIframe = getResolvedIframeUrl(selectedTranslation, epNum, defaultKodik);

      if (resolvedIframe) {
        schemaVideoUrl = `${origin}/api/media/playlist?url=${encodeURIComponent(resolvedIframe)}`;
      } else {
        schemaVideoUrl = `${origin}/api/proxy-4k?url=${encodeURIComponent("https://cdn.kamianime.club/kimi-no-na-wa/master.m3u8")}`;
      }
    }
  }

  // Episode metadata generator for Crunchyroll-styled widescreen list
  const getEpisodeMetadata = (num: number, animeTitle: string) => {
    const titles = [
      "Прибытие и новые знакомства",
      "Скрытая сила пробуждается",
      "Решение, меняющее судьбу тайтла",
      "Путешествие сквозь пространство и время",
      "Опасное столкновение в сумерках",
      "Разоблачение древней тайны предков",
      "Союзники объединяют сердца",
      "Воспоминания из далекого прошлого",
      "Неожиданное возвращение соперника",
      "Решающая битва за спасение мира",
      "Обещание, данное под звёздным небом",
      "Финал грандиозного пути героев"
    ];
    const descPool = [
      "Наши герои начинают свое невероятное приключение. Первые трудности закаляют характер и сплачивают команду.",
      "Старые тайны вырываются на свободу. Силы зла пытаются использовать древнее писание в корыстных целях.",
      "Каждое принятое решение имеет свои последствия. Судьбоносный шаг меняет привычный мир навсегда.",
      "Ветры судьбы ведут команду сквозь неизведанные земли навстречу великим испытаниям.",
      "Новый сильный противник преграждает путь. Смогут ли наши друзья найти слабое место соперника?",
      "Пришло время раскрыть карты. Истина оказывается более захватывающей и пугающей, чем казалось."
    ];
    
    const title = titles[(num - 1) % titles.length];
    const description = `${descPool[(num - 1) % descPool.length]} Поднимитесь на новый уровень качества просмотра с KamiAnime.`;
    const duration = "24 мин";
    return { title, description, duration };
  };

  return (
    <div className="w-full relative overflow-x-hidden pb-20">
      <SEO
        title={seoTitle}
        description={seoDescription}
        image={anime.image}
        type="video.movie"
        keywords={seoKeywords}
        noindex={isHentai}
        schemaData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": anime.type === "TV Series" ? "TVSeries" : "Movie",
              name: anime.title,
              alternateName: anime.originalName,
              description: anime.description,
              image: anime.image,
              genre: anime.genres,
              datePublished: anime.year,
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: anime.rating,
                bestRating: "10",
                worstRating: "1",
                ratingCount: "100",
              },
            },
            {
              "@type": "VideoObject",
              name: `${anime.title} ${paramEpisode ? `— Серия ${paramEpisode}` : ""}`,
              description:
                anime.description ||
                `Смотреть ${anime.title} онлайн на KamiAnime`,
              thumbnailUrl: [anime.image],
              uploadDate: anime.year
                ? `${anime.year}-01-01T00:00:00Z`
                : new Date().toISOString(),
              embedUrl:
                typeof window !== "undefined"
                  ? window.location.href
                  : `https://kamianime.club/anime/${anime.id}${paramEpisode ? `/episode/${paramEpisode}` : ""}`,
              contentUrl: schemaVideoUrl,
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Главная",
                  item: "https://animeshka.club/",
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Каталог",
                  item: "https://animeshka.club/catalog",
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: anime.title,
                  item: `https://animeshka.club/anime/${anime.id}${anime.slug ? `-${anime.slug}` : ""}`,
                },
              ],
            },
          ],
        }}
      />
      <div className="absolute top-0 left-0 w-full h-[60vh] overflow-hidden z-0">
        <Image
          src={anime.cover || anime.image}
          alt=""
          animeId={anime.id}
          animeTitle={anime.originalName || anime.title}
          priority
          className="w-full h-full object-cover blur-[2px] brightness-[0.4] scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/60 to-transparent" />
      </div>

      <div className="max-w-[1600px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto px-4 sm:px-6 lg:px-8 3xl:px-16 relative z-10 pt-24 md:pt-32">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 overflow-x-auto hide-scrollbar whitespace-nowrap">
          <Link
            to="/"
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <HomeIcon className="w-3 h-3" /> Главная
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-700" />
          <Link to="/catalog" className="hover:text-white transition-colors">
            Каталог
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-700" />
          <span className="text-primary truncate max-w-[200px]">
            {anime.title}
          </span>
        </nav>

        <div className="mb-10 animate-in slide-in-from-bottom-5 duration-700">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <span className="px-3 py-1 bg-white/10 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-white">
              {anime.type}
            </span>
            <span className="px-3 py-1 bg-white/10 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-white">
              {anime.year}
            </span>
            <span
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${anime.status === "Ongoing" ? "bg-green-500/20 text-green-400" : "bg-primary/20 text-primary"}`}
            >
              {anime.status}
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black text-white leading-tight mb-2 uppercase tracking-tighter drop-shadow-2xl">
            {isYourName ? "Твоё имя (Kimi no Na wa) в 4K" : 
             isSuzume ? "Судзумэ, закрывающая двери в 4K" :
             isWeathering ? "Дитя погоды в 4K" :
             isGardenOfWords ? "Сад изящных слов в 4K" :
             generatedSEO.h1Text}
          </h1>
          {anime.originalName && (
            <h2 className="text-xl md:text-2xl font-bold text-slate-400 mb-6">
              {anime.originalName}
            </h2>
          )}
          <div className="flex items-center gap-2 text-yellow-400 font-black text-lg bg-black/40 px-4 py-2 rounded-xl border border-white/5 w-fit shadow-xl">
            <Star className="w-5 h-5 fill-current" /> {anime.rating}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-12 items-stretch">
          <div className="flex flex-col gap-4 h-full">
            <div className="aspect-[2/3] rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 ring-4 ring-dark bg-surface hidden lg:block shrink-0">
              <Image
                src={anime.image}
                alt={anime.title}
                animeId={anime.id}
                animeTitle={anime.originalName || anime.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div
              className="grid grid-cols-1 gap-3 relative shrink-0"
              ref={statusDropdownRef}
            >
              <button
                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                disabled={isActionLoading}
                className={`w-full py-4 glass font-black text-[10px] tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 ${animeStatus !== "none" ? "text-primary bg-primary/10 border-primary/20 shadow-lg shadow-primary/10" : "text-white hover:bg-white/10"}`}
              >
                {isActionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {animeStatus === "watched" && (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    {animeStatus === "watching" && <Film className="w-4 h-4" />}
                    {animeStatus === "dropped" && <X className="w-4 h-4" />}
                    {animeStatus === "planned" && (
                      <Heart className="w-4 h-4 fill-current" />
                    )}
                    {animeStatus === "none" && <Star className="w-4 h-4" />}

                    {animeStatus === "watched" && "ПРОСМОТРЕНО"}
                    {animeStatus === "watching" && "СМОТРЮ"}
                    {animeStatus === "dropped" && "БРОШЕНО"}
                    {animeStatus === "planned" && "В ПЛАНАХ"}
                    {animeStatus === "none" && "ВЫБРАТЬ СТАТУС"}
                  </>
                )}
              </button>

              {isStatusDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-dark/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden z-50 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                  <button
                    onClick={() => handleStatusChange("watched")}
                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4 text-green-500" />{" "}
                    Просмотрено
                  </button>
                  <button
                    onClick={() => handleStatusChange("watching")}
                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <Film className="w-4 h-4 text-blue-500" /> Смотрю
                  </button>
                  <button
                    onClick={() => handleStatusChange("planned")}
                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <Heart className="w-4 h-4 text-pink-500" /> В планах
                  </button>
                  <button
                    onClick={() => handleStatusChange("dropped")}
                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <X className="w-4 h-4 text-red-500" /> Брошено
                  </button>
                  <button
                    onClick={() => handleStatusChange("none")}
                    className="w-full px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                  >
                    Удалить из списка
                  </button>
                </div>
              )}

              <button
                onClick={() => navigate(`/forum?animeId=${id}`)}
                className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 font-black text-[10px] tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 text-white"
              >
                <MessageSquare className="w-4 h-4" /> ОБСУДИТЬ НА ФОРУМЕ
              </button>
              <button
                onClick={() => {
                  if (!user) {
                    openAuthModal();
                    return;
                  }
                  setIsShareModalOpen(true);
                }}
                className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 font-black text-[10px] tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 text-white"
              >
                <Share2 className="w-4 h-4" /> ПОДЕЛИТЬСЯ С ДРУГОМ
              </button>
              <button
                onClick={() => {
                  const url = window.location.href;
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(url);
                    alert("Ссылка скопирована в буфер обмена!");
                  }
                }}
                className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 font-black text-[10px] tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 text-white"
              >
                <Copy className="w-4 h-4" /> КОПИРОВАТЬ ССЫЛКУ
              </button>
            </div>

            <div className="bg-surface/50 p-6 rounded-[2rem] border border-white/5 space-y-4 backdrop-blur-md shadow-xl flex-1">
              <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                Информация
              </h3>
              <div className="space-y-3 text-sm font-medium">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Тип</span>
                  <span className="font-bold text-white">{anime.type}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Эпизоды</span>
                  <span className="font-bold text-white">
                    {anime.episodesAired} / {anime.episodes}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Студия</span>
                  <span className="font-bold text-white">{anime.studio}</span>
                </div>
                <div className="pt-2">
                  <span className="text-slate-400 block mb-2">Жанры</span>
                  <div className="flex flex-wrap gap-2">
                    {anime.genres.map((g) => (
                      <Link
                        to={`/catalog?genre=${g}`}
                        key={g}
                        className="text-[10px] font-bold bg-white/5 px-2 py-1 rounded text-slate-300 hover:text-primary transition-colors"
                      >
                        {g}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-16">
            <section className="bg-surface/30 p-8 md:p-10 rounded-[2.5rem] border border-white/5 shadow-xl backdrop-blur-sm">
              <h3 className="text-[10px] font-black text-slate-500 mb-6 uppercase tracking-widest flex items-center gap-2.5">
                <span className="w-1.5 h-6 bg-primary rounded-full inline-block animate-pulse" /> Описание
              </h3>
              <div className="relative">
                <p
                  className={`text-slate-200 leading-relaxed font-medium text-base md:text-lg transition-all duration-500 overflow-hidden ${!isDescriptionExpanded ? "max-h-[150px] md:max-h-none" : "max-h-[2000px]"}`}
                >
                  {anime.description}
                </p>
                {!isDescriptionExpanded && (
                  <div className="absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-surface/80 to-transparent md:hidden pointer-events-none" />
                )}
                <button
                  onClick={() =>
                    setIsDescriptionExpanded(!isDescriptionExpanded)
                  }
                  className="mt-4 text-primary font-black text-[10px] uppercase tracking-widest md:hidden flex items-center gap-2"
                >
                  {isDescriptionExpanded ? "Свернуть" : "Читать полностью"}
                  <ChevronRight
                    className={`w-3 h-3 transition-transform ${isDescriptionExpanded ? "-rotate-90" : "rotate-90"}`}
                  />
                </button>
              </div>
            </section>

            {/* SEO Long-Tail Promotion Block (НЧ-оптимизация) */}
            <section className="bg-gradient-to-br from-primary/10 via-white/5 to-transparent p-8 md:p-10 rounded-[2.5rem] border border-primary/25 shadow-xl backdrop-blur-sm space-y-4">
              <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-2.5">
                <span className="w-1.5 h-6 bg-primary rounded-full inline-block animate-pulse" /> Где смотреть аниме в 4К и без рекламы казино?
              </h3>
              <p className="text-slate-300 leading-relaxed text-sm md:text-base font-normal">
                {generatedSEO.promoText.split("**").map((part, index) => 
                  index % 2 === 1 ? (
                    <strong key={index} className="text-white font-extrabold underline decoration-primary decoration-2 underline-offset-4">
                      {part}
                    </strong>
                  ) : (
                    part
                  )
                )}
              </p>
            </section>

            <section className="scroll-mt-24" id="watch">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
                <h3 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2.5">
                  <span className="w-1.5 h-6 bg-primary rounded-full inline-block animate-pulse" />
                  Смотреть онлайн
                </h3>
                {anime?.status !== "released" && (
                  <div className="flex flex-wrap gap-2.5 items-center w-full md:w-auto">
                    <button
                      onClick={() => {
                        const botUsername =
                          import.meta.env.VITE_TELEGRAM_BOT_USERNAME ||
                          "KamiAnime_bot";
                        window.open(
                          `https://t.me/${botUsername}?start=anime_${id}`,
                          "_blank",
                        );
                      }}
                      className="px-4 py-2.5 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border border-[#0088cc]/20 text-[#0088cc] rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                      <Bell className="w-4 h-4" /> Уведомлять о сериях
                    </button>
                  </div>
                )}
              </div>

              {roomId && (
                <div id="co-watching-room-panel" className="mb-6 bg-slate-900/90 border border-purple-500/30 rounded-[2rem] p-5 sm:p-6 shadow-[0_10px_30px_rgba(168,85,247,0.1)] backdrop-blur-md flex flex-col gap-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-500/15 rounded-2xl flex items-center justify-center text-purple-400 border border-purple-500/20">
                        <Users className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-base flex items-center gap-2">
                          Совместный просмотр
                          <span className="px-2 py-0.5 bg-purple-500/25 text-purple-300 text-[10px] rounded-full font-bold uppercase tracking-wider">
                            Войсчат активен
                          </span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Роль:{" "}
                          <span className="text-purple-400 font-bold">
                            {role === "host" ? "Хост комнаты" : "Зритель"}
                          </span>{" "}
                          • В сети: <span className="text-white font-bold">{usersCount} чел.</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Toggle Voice Channel */}
                      <button
                        onClick={toggleVoiceMute}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                          isVoiceMuted
                            ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/20 text-red-400"
                            : "bg-green-500/20 hover:bg-green-500/30 border-green-500/30 text-green-400 shadow-[0_0_12px_rgba(34,197,94,0.15)]"
                        }`}
                      >
                        {isVoiceMuted ? (
                          <>
                            <MicOff className="w-4 h-4" /> Включить микрофон
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4 animate-bounce" /> Микрофон активен
                          </>
                        )}
                      </button>

                      {/* Copy Link with reactive check icon and state */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href);
                          setCopiedRoomLink(true);
                          setTimeout(() => setCopiedRoomLink(false), 2500);
                        }}
                        className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
                      >
                        {copiedRoomLink ? (
                          <>
                            <Check className="w-4 h-4 text-green-400" /> Скопировано!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" /> Пригласить друзей
                          </>
                        )}
                      </button>

                      {/* Disconnect Room Button */}
                      <button
                        onClick={() => {
                          setRoomId(null);
                          setSearchParams(
                            (prev) => {
                              prev.delete("room");
                              return prev;
                            },
                            { replace: true },
                          );
                        }}
                        className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all border border-red-500/20 cursor-pointer"
                        title="Выйти из комнаты"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Joined users list */}
                  <div>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-2 pl-1">
                      Участники в комнате ({joinedUsers.length}):
                    </span>
                    <div className="flex flex-wrap gap-3">
                      {joinedUsers.map((item) => {
                        const isItself = item.clientId === myId;
                        return (
                          <div
                            key={item.clientId}
                            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all ${
                              isItself
                                ? "bg-purple-500/10 border-purple-500/20 text-white"
                                : "bg-white/5 border-white/5 text-slate-300"
                            }`}
                          >
                            <div className="relative">
                              <img
                                src={item.avatar}
                                alt={item.name}
                                className="w-8 h-8 rounded-full object-cover border border-white/10"
                                referrerPolicy="no-referrer"
                              />
                              <div
                                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center p-0.5 border text-[8px] ${
                                  item.isMuted
                                    ? "bg-red-500 border-slate-900 text-white"
                                    : "bg-green-500 border-slate-900 text-white animate-pulse"
                                }`}
                              >
                                {item.isMuted ? (
                                  <MicOff className="w-2.5 h-2.5" />
                                ) : (
                                  <Mic className="w-2.5 h-2.5" />
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col leading-tight">
                              <span className="text-xs font-bold flex items-center gap-1">
                                {item.name}
                                {isItself && (
                                  <span className="text-[9px] text-purple-400 font-normal">
                                    (Вы)
                                  </span>
                                )}
                              </span>
                              <span className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                                {item.isHost ? (
                                  <span className="text-purple-400 font-semibold">• Хост</span>
                                ) : (
                                  <span>• Зритель</span>
                                )}
                                {!item.isMuted && (
                                  <span className="text-green-400 font-medium animate-pulse">
                                    • Говорит
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Host watch location display for viewers */}
                  {role === "viewer" && hostState && (
                    <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-xs text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                        Синхронизация с хостом:
                      </span>
                      <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded">
                        {Math.floor((hostState.time || 0) / 60)
                          .toString()
                          .padStart(2, "0")}
                        :
                        {Math.floor((hostState.time || 0) % 60)
                          .toString()
                          .padStart(2, "0")}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-purple-400">
                        {hostState.isPlaying ? "Идет воспроизведение" : "Пауза"}
                      </span>
                    </div>
                  )}

                  {/* Micro permissions warnings */}
                  {voiceError && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-yellow-400 animate-headShake">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold">Внимание с голосовой связью</p>
                        <p className="text-[11px] opacity-90 mt-0.5">{voiceError}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-6">
                {/* Player Switcher Bar (Tabs) */}
                {players.length > 0 && (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full custom-scrollbar">
                      {players.map((p) => {
                        const isSelected = selectedPlayer === p.name;
                        return (
                          <button
                            key={p.name}
                            id={`select-player-${p.name.replace(/\s+/g, '-').toLowerCase()}`}
                            onClick={() => setSelectedPlayer(p.name)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border ${
                              isSelected
                                ? "bg-primary text-white border-primary shadow-lg shadow-primary/25"
                                : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border-white/10"
                            }`}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Primary Video Player Screen */}
                <div className="w-full aspect-video bg-black rounded-[1.5rem] md:rounded-[2rem] overflow-hidden border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] relative group">
                  {isBlocked ? (
                    <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-center p-6">
                      <Shield className="w-16 h-16 text-red-500 mb-4" />
                      <h4 className="text-xl font-bold text-white mb-2">
                        Видео недоступно
                      </h4>
                      <p className="text-gray-400">
                        Удалено по требованию правообладателя
                      </p>
                    </div>
                  ) : (
                    <>
                      {isPlayersLoading || isResolvingStream ? (
                        <div className="absolute inset-0 bg-dark/90 flex flex-col items-center justify-center text-center p-6 z-20">
                          <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                          <p className="text-slate-300 font-bold text-sm uppercase tracking-widest">
                            {isResolvingStream ? "Резолвинг потока AniBoom..." : "Поиск плеера..."}
                          </p>
                        </div>
                      ) : players.find((p) => p.name === selectedPlayer)
                          ?.iframe ||
                        players.find((p) => p.name === selectedPlayer)
                          ?.isCustom ? (
                        (() => {
                          const player = players.find(
                            (p) => p.name === selectedPlayer,
                          )!;
                          if (player.isCustom || player.name === "Aniboom") {
                            const isSuzume = id === "50594" || id === "62568";
                            const isWeathering = id === "38826";
                            const isGardenOfWords = id === "16782";
                            const isKimiNoNaWa = id === "32281";

                            let customSrc = "";
                            let maxTracks: number | undefined = undefined;
                            let audioTrackNames: string[] | undefined =
                              undefined;

                            if (
                              isSuzume ||
                              isWeathering ||
                              isGardenOfWords ||
                              isKimiNoNaWa
                            ) {
                              const customRawSrc = isSuzume
                                ? "https://cdn1.kamianime.club/suzume/master.m3u8"
                                : isWeathering
                                  ? "https://cdn1.kamianime.club/weathering/master.m3u8"
                                  : isGardenOfWords
                                    ? "https://cdn1.kamianime.club/garden_of_words/master.m3u8"
                                    : "https://cdn.kamianime.club/kimi-no-na-wa/master.m3u8";
                              customSrc = `/api/proxy-4k?url=${encodeURIComponent(customRawSrc)}`;
                              maxTracks = isSuzume ? 5 : undefined;
                              audioTrackNames = isSuzume
                                ? [
                                    "Crunchyroll",
                                    "Flarrow Films",
                                    "TVShows",
                                    "Leviafilm",
                                    "AniLibria",
                                    "Ю. Сербин",
                                    "Netflix КЗ.",
                                    "Оригинал + Субтитры",
                                    "Оригинал",
                                  ]
                                : undefined;
                            } else {
                              // Extract Aniboom stream URL for KamiPlayer (and use secure backend resolution)
                              const epNum = parseInt(paramEpisode || "1") || 1;
                              const defaultAniboom = players.find((p) => p.name === "Aniboom")?.iframe;
                              const aniboomStream = getResolvedAniboomUrl(selectedTranslation, epNum, defaultAniboom);

                              if (resolvedStream && resolvedStream.url) {
                                customSrc = resolvedStream.url;
                              } else if (aniboomStream) {
                                customSrc = `/api/media/playlist?url=${encodeURIComponent(aniboomStream)}`;
                              } else {
                                const defaultKodik = players.find((p) => p.name === "Kodik")?.iframe;
                                const kodikIframeUrl = getResolvedKodikUrl(selectedTranslation, epNum, defaultKodik);
                                if (kodikIframeUrl) {
                                  customSrc = `/api/media/playlist?url=${encodeURIComponent(kodikIframeUrl)}`;
                                } else {
                                  const defaultCollaps = players.find((p) => p.name === "Collaps")?.iframe;
                                  const collapsIframeUrl = getResolvedCollapsUrl(selectedTranslation, epNum, defaultCollaps);
                                  if (collapsIframeUrl) {
                                    customSrc = `/api/media/playlist?url=${encodeURIComponent(collapsIframeUrl)}`;
                                  } else {
                                    customSrc = `/api/proxy-4k?url=${encodeURIComponent("https://cdn.kamianime.club/kimi-no-na-wa/master.m3u8")}`;
                                  }
                                }
                              }
                            }

                            const episodesCount = selectedTranslation?.last_episode || selectedTranslation?.episodes_count || (anime
                              ? (anime.episodesAired || anime.episodes || 1)
                              : 1);
                            const currentEpNum = parseInt(paramEpisode || "1") || 1;

                            const handleNextEp = currentEpNum < episodesCount ? () => {
                              const nextEp = currentEpNum + 1;
                              let newUrl = `/anime/${paramId}/episode/${nextEp}`;
                              if (window.location.search) {
                                newUrl += window.location.search;
                              }
                              navigate(newUrl);
                            } : undefined;

                            const handlePrevEp = currentEpNum > 1 ? () => {
                              const prevEp = currentEpNum - 1;
                              let newUrl = `/anime/${paramId}/episode/${prevEp}`;
                              if (window.location.search) {
                                newUrl += window.location.search;
                              }
                              navigate(newUrl);
                            } : undefined;

                            return (
                              <CustomPlayer
                                ref={nativeVideoRef}
                                src={customSrc}
                                streamType={resolvedStream?.streamType}
                                provider={resolvedStream?.provider || (selectedTranslation as any)?.provider}
                                translationTitle={selectedTranslation?.title}
                                animeTitle={anime?.title || "KamiAnime"}
                                poster=""
                                maxAudioTracks={maxTracks}
                                audioTrackNames={audioTrackNames}
                                animeId={id}
                                episodeNumber={paramEpisode || "1"}
                                onNextEpisode={handleNextEp}
                                onPrevEpisode={handlePrevEp}
                                onOpenWatchTogether={() => {
                                  if (!roomId) {
                                    handleCreateRoom();
                                  } else {
                                    document.getElementById('co-watching-room-panel')?.scrollIntoView({ behavior: 'smooth' });
                                  }
                                }}
                                onOpenDownload={() => setIsDownloadModalOpen(true)}
                                isWatchTogetherActive={!!roomId}
                                onPlayerError={() => {
                                  if (players.some((p) => p.name === "Kodik")) {
                                    setSelectedPlayer("Kodik");
                                  } else if (players.some((p) => p.name === "Collaps")) {
                                    setSelectedPlayer("Collaps");
                                  }
                                }}
                              />
                            );
                          }
                          const epNum = parseInt(paramEpisode || "1") || 1;
                          let finalIframeUrl = (
                            player.name === "Collaps" || player.name.toLowerCase().includes("collaps")
                              ? getResolvedCollapsUrl(selectedTranslation, epNum, player.iframe)
                              : player.name === "Kodik" || player.name.toLowerCase().includes("kodik")
                                ? getResolvedKodikUrl(selectedTranslation, epNum, player.iframe)
                                : getResolvedIframeUrl(selectedTranslation, epNum, player.iframe)
                          ) || player.iframe;

                          if (finalIframeUrl && (player.name === "Kodik" || player.name === "Collaps" || finalIframeUrl.includes("collaps") || finalIframeUrl.includes("ortified"))) {
                            try {
                              const absoluteUrl = finalIframeUrl.startsWith(
                                "//",
                              )
                                ? `https:${finalIframeUrl}`
                                : finalIframeUrl;
                              const url = new URL(absoluteUrl);
                              if (paramEpisode)
                                url.searchParams.set("episode", paramEpisode);
                              finalIframeUrl = url.toString();
                            } catch (e) {}
                          }

                          const isCollaps = finalIframeUrl && (
                            finalIframeUrl.includes("collaps") ||
                            finalIframeUrl.includes("ortified") ||
                            player.name === "Collaps"
                          );

                          const playerSrc = isCollaps && finalIframeUrl
                            ? `/api/collaps/embed?url=${encodeURIComponent(finalIframeUrl)}`
                            : (finalIframeUrl || undefined);

                          console.log(
                            `%c[Player Source]%c ВЫБРАН ИСТОЧНИК: %c ${(player.name || "IFRAME").toUpperCase()} %c | Серия: ${paramEpisode || 1} | Озвучка: ${selectedTranslation?.title || "Основная"}`,
                            "background: #1e1b4b; color: #a78bfa; font-weight: bold; padding: 4px 6px; border-radius: 4px 0 0 4px;",
                            "background: #312e81; color: #ffffff; font-weight: bold; padding: 4px 6px;",
                            player.name.toLowerCase().includes("kodik")
                              ? "background: #d97706; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;"
                              : "background: #2563eb; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
                            "background: #1e1b4b; color: #cbd5e1; padding: 4px 6px; border-radius: 0 4px 4px 0;"
                          );

                          return (
                            <iframe
                              ref={iframeRef}
                              src={playerSrc}
                              width="100%"
                              height="100%"
                              allow="autoplay *; fullscreen *; accelerometer; gyroscope; picture-in-picture; encrypted-media;"
                              referrerPolicy="no-referrer"
                              className="w-full h-full border-0 rounded-2xl"
                              title={player.name || "Player"}
                            />
                          );
                        })()
                      ) : (
                        <div className="absolute inset-0 bg-dark/90 flex flex-col items-center justify-center text-center p-6">
                          <AlertTriangle className="w-12 h-12 text-slate-500 mb-4" />
                          <p className="text-slate-300 font-bold text-sm uppercase tracking-widest">
                            {playersError || "Видео не найдено"}
                          </p>
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">
                            Возможно, аниме еще не вышло
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Voice Translations & Clean Episode List Widget */}
                {anime && (
                  <div className="bg-[#1c1d21]/60 border border-white/5 p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] flex flex-col gap-6 font-sans shadow-xl backdrop-blur-sm">
                    {/* Controls Row: Voice/Translation selector & Search input */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
                      {/* Collapsible Dropdown for Voice Translations */}
                      <div className="relative flex-1 max-w-md">
                        {(() => {
                          const activeT = selectedTranslation || translations[0];
                          const activeCleanTitle = activeT ? getCleanTitle(activeT.title) : "Дубляж KamiAnime";
                          const activeEpTotal = activeT ? (activeT.last_episode || activeT.episodes_count || 1) : 1;
                          const activeQuality = activeT ? getTranslationQuality(activeT) : "1080p";

                          return (
                            <button
                              onClick={() => setIsNotifierOpen(!isNotifierOpen)}
                              className="w-full bg-black/40 hover:bg-[#25262c] text-white border-l-4 border-l-primary border border-white/5 py-3 px-4 rounded-r-xl cursor-pointer flex items-center justify-between transition-all"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <Crown className="w-4 h-4 text-primary fill-current shrink-0" />
                                <span className="text-xs sm:text-sm font-black uppercase tracking-wider truncate">
                                  {activeCleanTitle}
                                </span>
                                {activeT && (
                                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                                      {activeEpTotal} сер.
                                    </span>
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                                      {activeQuality}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${isNotifierOpen ? "rotate-180" : ""}`} />
                            </button>
                          );
                        })()}

                        {isNotifierOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-[#1c1d21] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="p-1.5 space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                              {translations.map((t, index) => {
                                const isSelected = selectedTranslation
                                  ? t.title === selectedTranslation.title
                                  : index === 0;
                                const epTotal = t.last_episode || t.episodes_count || 1;
                                const tQuality = getTranslationQuality(t);
                                const tCleanTitle = getCleanTitle(t.title);

                                return (
                                  <button
                                    key={t.id || index}
                                    onClick={() => {
                                      setSelectedTranslation(t);
                                      setIsNotifierOpen(false);
                                      if ((t as any).provider === "Collaps" || (t.title && t.title.includes("Collaps"))) {
                                        if (players.some((p) => p.name === "Collaps")) {
                                          setSelectedPlayer("Collaps");
                                        }
                                      }
                                    }}
                                    className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-between ${
                                      isSelected
                                        ? "bg-white/5 text-primary"
                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate pr-2">
                                      <span className="truncate">{tCleanTitle}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                                        {epTotal} сер.
                                      </span>
                                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                        isSelected
                                          ? "bg-primary/20 text-primary border border-primary/30"
                                          : "bg-white/5 text-slate-400 border border-white/10"
                                      }`}>
                                        {tQuality}
                                      </span>
                                      {isSelected && <Check className="w-4 h-4 text-primary ml-0.5 shrink-0" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Episode Search Filter */}
                      {(() => {
                        const totalEps = (selectedTranslation?.last_episode || selectedTranslation?.episodes_count) || anime.episodesAired || anime.episodes || 1;
                        if (totalEps > 1) {
                          return (
                            <div className="relative flex items-center">
                              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 pointer-events-none" />
                              <input
                                type="text"
                                placeholder="Быстрый поиск серии..."
                                className="pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 hover:border-primary/40 focus:border-primary rounded-xl text-xs font-bold text-white placeholder-slate-500 focus:outline-none transition-all w-full sm:w-52"
                                value={epSearchVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEpSearchVal(val);
                                  const sanitized = val.replace(/\D/g, "");
                                  if (sanitized) {
                                    const epNum = parseInt(sanitized, 10);
                                    if (epNum >= 1 && epNum <= totalEps) {
                                      let newUrl = `/anime/${paramId}/episode/${epNum}`;
                                      if (window.location.search) {
                                        newUrl += window.location.search;
                                      }
                                      navigate(newUrl);
                                    }
                                  }
                                }}
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* EPISODES LIST: Compact format "[Number] - [Title]" with truncation */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-400">
                        <span>Список серий ({(selectedTranslation?.last_episode || selectedTranslation?.episodes_count) || anime.episodesAired || anime.episodes || 1})</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                        {(() => {
                          const totalEps = (selectedTranslation?.last_episode || selectedTranslation?.episodes_count) || anime.episodesAired || anime.episodes || 1;
                          const filteredEpisodes = Array.from({ length: totalEps }, (_, index) => index + 1)
                            .filter(epNum => {
                              if (!epSearchVal) return true;
                              return epNum.toString() === epSearchVal.trim();
                            });

                          if (filteredEpisodes.length === 0) {
                            return (
                              <div className="col-span-full py-8 text-center text-slate-500 font-bold uppercase tracking-wider text-xs">
                                Серия не найдена
                              </div>
                            );
                          }

                          return filteredEpisodes.map((epNum) => {
                            const isCurrentActive = (paramEpisode || "1") === epNum.toString();
                            const isWatched = watchedEpisodes.includes(epNum.toString());
                            const meta = getEpisodeMetadata(epNum, anime.title);

                            return (
                              <button
                                key={epNum}
                                id={`episode-btn-${epNum}`}
                                onClick={() => {
                                  let epUrl = `/anime/${paramId}/episode/${epNum}`;
                                  if (window.location.search) {
                                    epUrl += window.location.search;
                                  }
                                  navigate(epUrl);
                                }}
                                title={`${epNum} - ${meta.title}`}
                                className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer group ${
                                  isCurrentActive
                                    ? "bg-primary/20 border-primary text-white shadow-md shadow-primary/10"
                                    : "bg-black/30 border-white/5 hover:bg-white/5 hover:border-white/15 text-slate-300"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className={`text-xs font-black shrink-0 ${isCurrentActive ? "text-primary" : "text-slate-400 group-hover:text-white"}`}>
                                    {epNum} -
                                  </span>
                                  <span className={`text-xs truncate ${isCurrentActive ? "text-white font-bold" : "text-slate-300 font-medium group-hover:text-white"}`}>
                                    {meta.title}
                                  </span>
                                </div>
                                {isWatched && (
                                  <span className="px-1.5 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[9px] font-black rounded shrink-0">
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Direct Browser Downloader Card */}
            {(() => {
              if (selectedPlayer === "Kodik") {
                const baseIframe =
                  selectedTranslation?.iframe ||
                  players.find((p) => p.name === "Kodik")?.iframe;
                if (baseIframe) {
                  let kodikIframeWithEpisode = baseIframe;
                  try {
                    const url = new URL(
                      kodikIframeWithEpisode.startsWith("//")
                        ? `https:${kodikIframeWithEpisode}`
                        : kodikIframeWithEpisode,
                    );
                    if (paramEpisode) {
                      url.searchParams.set("episode", paramEpisode);
                    }
                    kodikIframeWithEpisode = url.toString();
                  } catch (e) {}
                  
                  return (
                    <BrowserDownloadWidget
                      episodeUrl={kodikIframeWithEpisode}
                      animeTitle={anime?.title || "Anime"}
                      episodeNumber={paramEpisode || "1"}
                      shikimoriId={anime?.id || id}
                      translationId={selectedTranslation?.id ? String(selectedTranslation.id) : undefined}
                    />
                  );
                }
              }
              return null;
            })()}
          </div>
        </div>

        {/* Content after player aligned to right column */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-12 mt-16">
          <div className="hidden lg:block"></div>
          <div className="space-y-16">
            <LazyRender onVisible={() => setShouldLoadRelated(true)}>
              {isRelatedLoading ? (
                <section>
                  <div className="flex items-center justify-between mb-8">
                    <div className="h-8 w-48 bg-white/10 rounded-lg animate-pulse"></div>
                  </div>
                  <div className="flex flex-col gap-4">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="flex gap-4 p-4 rounded-2xl bg-white/5 animate-pulse"
                      >
                        <div className="w-16 h-24 bg-white/10 rounded-xl shrink-0"></div>
                        <div className="flex-1 py-2 space-y-2">
                          <div className="h-3 w-20 bg-white/10 rounded"></div>
                          <div className="h-4 w-3/4 bg-white/10 rounded"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                related.length > 0 && (
                  <section>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-8">
                      Порядок просмотра
                    </h3>
                    <div className="flex flex-col gap-3">
                      {related
                        .slice(0, isRelatedExpanded ? related.length : 8)
                        .map((item, idx) => {
                          const isPriority = [
                            "Продолжение",
                            "Предыстория",
                            "Sequel",
                            "Prequel",
                          ].includes(item.relation);
                          const isDmcaBlocked = dmcaBlocks.includes(
                            item.anime.id.toString(),
                          );
                          const isSlugBlocked = slugBlocks.includes(
                            item.anime.id.toString(),
                          );
                          const targetUrl = isDmcaBlocked
                            ? `/anime/${item.anime.id}-watch`
                            : `/anime/${item.anime.id}${item.anime.slug && !isSlugBlocked ? `-${item.anime.slug}` : ""}`;
                          return (
                            <Link
                              key={idx}
                              to={targetUrl}
                              className={`flex gap-4 p-3 rounded-2xl transition-all group items-center ${isPriority ? "bg-primary/10 border border-primary/20 hover:bg-primary/20" : "bg-white/5 hover:bg-white/10 border border-transparent"}`}
                            >
                              <div className="w-12 h-16 shrink-0 rounded-lg overflow-hidden relative">
                                <img
                                  src={item.anime.image}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                  alt=""
                                />
                                {isPriority && (
                                  <div className="absolute inset-0 bg-primary/20"></div>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <div
                                  className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-2 ${isPriority ? "text-primary" : "text-slate-500"}`}
                                >
                                  {item.relation}
                                  {isPriority && (
                                    <Forward className="w-3 h-3" />
                                  )}
                                </div>
                                <h4
                                  className={`text-sm font-bold text-white truncate group-hover:text-primary transition-colors`}
                                >
                                  {item.anime.title}
                                </h4>
                                <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                                  {item.anime.year} • {item.anime.type}
                                </div>
                              </div>
                              <ChevronRight
                                className={`w-4 h-4 ${isPriority ? "text-primary" : "text-slate-600"} group-hover:translate-x-1 transition-transform`}
                              />
                            </Link>
                          );
                        })}
                      {related.length > 8 && (
                        <button
                          onClick={() =>
                            setIsRelatedExpanded(!isRelatedExpanded)
                          }
                          className="text-primary font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 mt-2"
                        >
                          {isRelatedExpanded ? "Свернуть" : "Показать еще"}
                          <ChevronRight
                            className={`w-3 h-3 transition-transform ${isRelatedExpanded ? "-rotate-90" : "rotate-90"}`}
                          />
                        </button>
                      )}
                    </div>
                  </section>
                )
              )}
            </LazyRender>

            <LazyRender onVisible={() => setShouldLoadSimilar(true)}>
              {isSimilarLoading ? (
                <section>
                  <div className="flex items-center justify-between mb-8">
                    <div className="h-8 w-48 bg-white/10 rounded-lg animate-pulse"></div>
                  </div>
                  <div className="flex gap-6 overflow-hidden">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="w-[200px] md:w-[240px] shrink-0">
                        <div className="aspect-[2/3] bg-white/5 rounded-3xl mb-3 animate-pulse"></div>
                        <div className="h-4 w-3/4 bg-white/5 rounded mb-2 animate-pulse"></div>
                        <div className="h-3 w-1/2 bg-white/5 rounded animate-pulse"></div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                similar.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                        Похожее
                      </h3>
                      <div className="flex gap-2">
                        <button
                          aria-label="Scroll left"
                          onClick={() => scrollSlider(similarRef, "left")}
                          className="p-2.5 bg-white/5 hover:bg-accent rounded-xl transition-all shadow-xl active:scale-90"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          aria-label="Scroll right"
                          onClick={() => scrollSlider(similarRef, "right")}
                          className="p-2.5 bg-white/5 hover:bg-accent rounded-xl transition-all shadow-xl active:scale-90"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div
                      ref={similarRef}
                      className="flex gap-6 overflow-x-auto hide-scrollbar pb-6 snap-x"
                    >
                      {similar.map((sim, idx) => (
                        <div
                          key={idx}
                          className="w-[200px] md:w-[240px] shrink-0 snap-start"
                        >
                          <AnimeCard anime={sim} />
                        </div>
                      ))}
                    </div>
                  </section>
                )
              )}
            </LazyRender>

            <LazyRender onVisible={() => setShouldLoadReviews(true)}>
              <ReviewSection
                animeId={id!}
                reviews={reviews}
                onReviewAdded={(newReview) =>
                  setReviews([newReview, ...reviews])
                }
                onReport={(reviewId) => {
                  setReportTarget({
                    type: "review",
                    id: reviewId,
                    content: reviews.find((r) => r.id === reviewId)?.content,
                    link: window.location.pathname,
                  });
                  setIsReportModalOpen(true);
                }}
                onDelete={async (reviewId) => {
                  if (window.confirm("Удалить рецензию?")) {
                    await db.deleteReview(reviewId);
                    setReviews(reviews.filter((r) => r.id !== reviewId));
                  }
                }}
              />
            </LazyRender>

            <LazyRender onVisible={() => setShouldLoadComments(true)}>
              <section className="pt-10 border-t border-white/5">
                <h3 className="text-2xl font-black text-white uppercase mb-10">
                  Комментарии ({isCommentsLoading ? "..." : comments.length})
                </h3>
                <div className="bg-surface/30 rounded-[2.5rem] p-8 border border-white/5 mb-12 shadow-2xl backdrop-blur-sm">
                  {user ? (
                    <form
                      onSubmit={handleAddComment}
                      className="flex flex-col gap-6"
                    >
                      <div className="flex gap-5 items-start">
                        <img
                          src={user.avatar}
                          loading="lazy"
                          className="w-14 h-14 rounded-2xl object-cover shadow-lg ring-2 ring-white/5"
                          alt=""
                        />
                        <textarea
                          value={userComment}
                          onChange={(e) => setUserComment(e.target.value)}
                          placeholder="Напишите ваш отзыв..."
                          className="flex-1 bg-dark/60 border border-white/10 rounded-3xl p-6 text-sm text-white focus:border-primary outline-none min-h-[140px] resize-none transition-all shadow-inner"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isCommenting || !userComment.trim()}
                        className="self-end px-12 py-4 bg-primary text-white font-black text-[10px] uppercase rounded-2xl shadow-xl shadow-primary/20 disabled:opacity-50 hover:scale-105 active:scale-95 transition-all tracking-widest"
                      >
                        {isCommenting ? "ОТПРАВКА..." : "ОПУБЛИКОВАТЬ"}
                      </button>
                    </form>
                  ) : (
                    <div className="text-center py-10">
                      <button
                        onClick={openAuthModal}
                        className="px-12 py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-white text-[10px] uppercase hover:bg-white/10 transition-all tracking-widest"
                      >
                        АВТОРИЗАЦИЯ
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  {isCommentsLoading
                    ? [...Array(3)].map((_, i) => (
                        <div key={i} className="flex gap-6">
                          <div className="w-14 h-14 bg-white/5 rounded-2xl shrink-0 animate-pulse"></div>
                          <div className="flex-1">
                            <div className="h-4 w-32 bg-white/5 rounded mb-3 animate-pulse"></div>
                            <div className="h-24 w-full bg-white/5 rounded-[2rem] animate-pulse"></div>
                          </div>
                        </div>
                      ))
                    : comments.map((comment) => (
                        <div key={comment.id} className="flex gap-6 group">
                          <img
                            src={comment.user.avatar}
                            loading="lazy"
                            className="w-14 h-14 rounded-2xl object-cover shrink-0 shadow-md ring-2 ring-white/5"
                            alt=""
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="font-black text-white text-base">
                                {comment.user.name}
                              </span>
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {comment.date}
                              </span>
                            </div>
                            <div className="text-slate-400 text-base leading-relaxed bg-white/[0.02] p-6 rounded-[2rem] border border-white/5 group-hover:border-white/10 transition-all shadow-sm">
                              {filterProfanity(comment.text)}
                              <div className="mt-4 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setReportTarget({
                                      type: "comment",
                                      id: comment.id,
                                      content: filterProfanity(comment.text),
                                      link: window.location.pathname,
                                    });
                                    setIsReportModalOpen(true);
                                  }}
                                  className="text-[10px] font-bold text-slate-500 hover:text-red-500 uppercase tracking-widest flex items-center gap-1"
                                >
                                  <AlertTriangle className="w-3 h-3" />{" "}
                                  Пожаловаться
                                </button>
                                {(user?.role === "admin" ||
                                  user?.role === "moderator") && (
                                  <button
                                    onClick={async () => {
                                      if (
                                        window.confirm("Удалить комментарий?")
                                      ) {
                                        await db.deleteComment(comment.id);
                                        setComments(
                                          comments.filter(
                                            (c) => c.id !== comment.id,
                                          ),
                                        );
                                      }
                                    }}
                                    className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-widest flex items-center gap-1"
                                  >
                                    Удалить
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                </div>
              </section>
            </LazyRender>
          </div>
        </div>
      </div>

      {/* Room Instruction Modal */}
      {isRoomInstructionOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-primary"></div>
            <button
              onClick={() => setIsRoomInstructionOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 mb-6">
              <Users className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">
              Совместный просмотр
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              Добро пожаловать в комнату совместного просмотра! Вот как это
              работает:
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-1">
                  <span className="font-bold text-sm">1</span>
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">
                    Роли в комнате
                  </h4>
                  <p className="text-slate-400 text-xs mt-1">
                    <strong className="text-purple-400">Хост</strong>{" "}
                    (создатель) управляет плеером.{" "}
                    <strong className="text-purple-400">Зрители</strong> смотрят
                    синхронно с хостом.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-1">
                  <span className="font-bold text-sm">2</span>
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">
                    Синхронизация
                  </h4>
                  <p className="text-slate-400 text-xs mt-1">
                    Если видео рассинхронизировалось, просто кликните по плееру,
                    чтобы принудительно синхронизироваться с хостом.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-1">
                  <span className="font-bold text-sm">3</span>
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">
                    Приглашение друзей
                  </h4>
                  <p className="text-slate-400 text-xs mt-1">
                    Скопируйте ссылку на комнату и отправьте друзьям, чтобы они
                    могли присоединиться к просмотру.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsRoomInstructionOpen(false)}
              className="w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors"
            >
              Понятно, начать просмотр
            </button>
          </div>
        </div>
      )}

       {/* Download Series Modal */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
            <button
              onClick={() => setIsDownloadModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Download className="w-6 h-6 text-cyan-400" />
                Скачивание серии
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Выберите качество, чтобы собрать и скачать видеофайл прямо в браузере:
              </p>
            </div>

            {(() => {
              const epNum = parseInt(paramEpisode || "1") || 1;
              const defaultAniboom = players.find((p) => p.name === "Aniboom")?.iframe;
              const defaultKodik = players.find((p) => p.name === "Kodik")?.iframe;
              const defaultCollaps = players.find((p) => p.name === "Collaps")?.iframe;

              const aniboomIframe = getResolvedAniboomUrl(selectedTranslation, epNum, defaultAniboom);
              const kodikIframe = getResolvedKodikUrl(selectedTranslation, epNum, defaultKodik);
              const collapsIframe = getResolvedCollapsUrl(selectedTranslation, epNum, defaultCollaps);

              let targetUrl = "";
              if (downloadProvider === "aniboom") {
                targetUrl = aniboomIframe || kodikIframe || collapsIframe || "";
              } else if (downloadProvider === "kodik") {
                targetUrl = kodikIframe || aniboomIframe || collapsIframe || "";
              } else {
                targetUrl = collapsIframe || aniboomIframe || kodikIframe || "";
              }

              return (
                <div className="space-y-4">
                  {/* Source Provider Switcher */}
                  <div className="flex items-center gap-2 p-1.5 bg-black/40 border border-white/10 rounded-2xl overflow-x-auto custom-scrollbar">
                    {aniboomIframe && (
                      <button
                        onClick={() => setDownloadProvider("aniboom")}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                          downloadProvider === "aniboom"
                            ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>AniBoom (Рекомендуется)</span>
                      </button>
                    )}
                    {kodikIframe && (
                      <button
                        onClick={() => setDownloadProvider("kodik")}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                          downloadProvider === "kodik"
                            ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span>Kodik</span>
                      </button>
                    )}
                    {collapsIframe && (
                      <button
                        onClick={() => setDownloadProvider("collaps")}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                          downloadProvider === "collaps"
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span>Collaps</span>
                      </button>
                    )}
                  </div>

                  {targetUrl ? (
                    <BrowserDownloadWidget
                      episodeUrl={targetUrl}
                      animeTitle={anime?.title || "Anime"}
                      episodeNumber={paramEpisode || "1"}
                      shikimoriId={anime?.id || id}
                      translationId={selectedTranslation?.id ? String(selectedTranslation.id) : undefined}
                    />
                  ) : (
                    <div className="p-6 text-center text-slate-400 bg-white/5 border border-white/10 rounded-2xl">
                      <p className="font-semibold text-white mb-2 ml-1 flex items-center justify-center gap-1.5">
                        Прямое скачивание недоступно
                      </p>
                      <p className="text-xs text-slate-400">
                        Для выбранной озвучки отсутствует медиа-источник для сборки файлов.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsDownloadModalOpen(false)}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-black text-white uppercase tracking-widest">
                Поделиться с другом
              </h3>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {isLoadingFriends ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : friendsList.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">
                    У вас пока нет друзей
                  </p>
                  <Link
                    to="/community"
                    className="text-primary hover:underline mt-2 inline-block text-xs"
                  >
                    Найти друзей
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {friendsList.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between bg-white/5 p-3 rounded-2xl hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={friend.avatar}
                          alt={friend.name}
                          className="w-10 h-10 rounded-xl object-cover"
                        />
                        <span className="font-bold text-white text-sm">
                          {friend.name}
                        </span>
                      </div>
                      <button
                        onClick={() => handleShareToFriend(friend.email)}
                        disabled={isSharing}
                        className="px-4 py-2 bg-primary hover:bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
                      >
                        Отправить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {reportTarget && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => {
            setIsReportModalOpen(false);
            setReportTarget(null);
          }}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          targetContent={reportTarget.content}
          targetLink={reportTarget.link}
        />
      )}
    </div>
  );
};

export default Details;
