import React, { useState } from "react";
import { 
  Bot, 
  Terminal, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  Cpu, 
  ShieldAlert 
} from "lucide-react";

export interface DiagnosticStep {
  title: string;
  status: "success" | "error" | "info";
  message: string;
  details?: any;
}

export interface AniboomLogsState {
  timestamp: string;
  step: string;
  status: "info" | "success" | "error";
  message: string;
  details?: string;
}

interface AniboomDiagnosticsProps {
  logs: AniboomLogsState[];
  serverSteps?: DiagnosticStep[];
  isResolving: boolean;
  error: string | null;
  resolvedUrl: string | null;
  isCacheHit?: boolean;
  activeEpisode: string;
  activeTranslation: string;
  onRetry: () => void;
}

export const AniboomDiagnostics: React.FC<AniboomDiagnosticsProps> = ({
  logs,
  serverSteps,
  isResolving,
  error,
  resolvedUrl,
  isCacheHit = false,
  activeEpisode,
  activeTranslation,
  onRetry
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [expandedDetailsIdx, setExpandedDetailsIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // Combine client-side logs and server-side detailed steps
  const allLogs: { step: string; status: "info" | "success" | "error"; message: string; details?: string }[] = [];

  // Parse local logs
  logs.forEach(l => {
    allLogs.push({
      step: l.step,
      status: l.status,
      message: l.message,
      details: l.details
    });
  });

  // Append server steps if they exist and are not already represented
  if (serverSteps && serverSteps.length > 0) {
    serverSteps.forEach(s => {
      // Avoid duplicate step titles if they are similar
      if (!allLogs.some(l => l.step === s.title && l.message === s.message)) {
        allLogs.push({
          step: s.title,
          status: s.status,
          message: s.message,
          details: s.details ? (typeof s.details === "object" ? JSON.stringify(s.details, null, 2) : String(s.details)) : undefined
        });
      }
    });
  }

  const getStatusBadge = () => {
    if (isResolving) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Резолвинг
        </span>
      );
    }
    if (error) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20">
          <ShieldAlert className="w-3 h-3" />
          Сбой / Fallback
        </span>
      );
    }
    if (resolvedUrl) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="w-3 h-3" />
          Подключен
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-500/10 text-slate-400 border border-slate-500/20">
        <Bot className="w-3 h-3" />
        Ожидание
      </span>
    );
  };

  return (
    <div className="w-full bg-[#16171a] border border-white/5 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Header Bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/25">
            <Cpu className="w-4 h-4 text-primary animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              Отладчик потоков AniBoom (KamiPlayer)
            </h4>
            <p className="text-[11px] text-slate-400 font-medium">
              Серия {activeEpisode} • Озвучка: {activeTranslation} • {isCacheHit ? "Загружено из кэша" : "Прямой запрос к балансеру"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {getStatusBadge()}
          <button className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Console Logs Body */}
      {isOpen && (
        <div className="border-t border-white/5 px-6 py-5 bg-black/20 font-sans">
          
          {/* Action Toolbar */}
          <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-white/5 flex-wrap">
            <div className="text-xs text-slate-400 font-medium">
              {error ? (
                <span className="text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Ошибка резолвинга! Включен плавный fallback на Kodik/Collaps
                </span>
              ) : isResolving ? (
                "Выполняется поэтапный разбор параметров плеера AniBoom..."
              ) : (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Поток успешно декодирован и готов к проигрыванию в 1080p
                </span>
              )}
            </div>

            <button
              onClick={onRetry}
              disabled={isResolving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-primary hover:bg-primary-hover disabled:bg-primary/40 disabled:cursor-not-allowed text-white shadow-lg shadow-primary/25 transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResolving ? "animate-spin" : ""}`} />
              Сбросить кэш и перезапустить
            </button>
          </div>

          {/* Timeline Step Sequence */}
          {allLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs font-medium">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30 text-primary" />
              Логи инициализации отсутствуют. Начните воспроизведение.
            </div>
          ) : (
            <div className="relative border-l border-white/5 ml-3 pl-6 space-y-5">
              {allLogs.map((item, idx) => {
                const isSuccess = item.status === "success";
                const isError = item.status === "error";
                const isInfo = item.status === "info";
                const isDetailExpanded = expandedDetailsIdx === idx;

                return (
                  <div key={idx} className="relative group/item">
                    {/* Bullet indicator */}
                    <div className={`absolute -left-[31px] top-0.5 w-4.5 h-4.5 rounded-full flex items-center justify-center border ${
                      isSuccess 
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                        : isError
                          ? "bg-red-500/10 border-red-500 text-red-400"
                          : "bg-blue-500/10 border-blue-500 text-blue-400"
                    }`}>
                      {isSuccess ? (
                        <CheckCircle className="w-2.5 h-2.5" />
                      ) : isError ? (
                        <AlertTriangle className="w-2.5 h-2.5" />
                      ) : (
                        <Info className="w-2.5 h-2.5" />
                      )}
                    </div>

                    {/* Step Content */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-black text-white uppercase tracking-wider">
                          {item.step}
                        </span>
                        <span className={`text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                          isSuccess 
                            ? "bg-emerald-500/10 text-emerald-400"
                            : isError
                              ? "bg-red-500/10 text-red-400"
                              : "bg-blue-500/10 text-blue-400"
                        }`}>
                          {item.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 font-medium leading-relaxed max-w-4xl">
                        {item.message}
                      </p>

                      {/* Decoded Details / JSON Output Toggle */}
                      {item.details && (
                        <div className="mt-1">
                          <button
                            onClick={() => setExpandedDetailsIdx(isDetailExpanded ? null : idx)}
                            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary hover:text-primary-hover transition-colors"
                          >
                            <span>{isDetailExpanded ? "Свернуть" : "Показать JSON / детали"}</span>
                            {isDetailExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>

                          {isDetailExpanded && (
                            <div className="mt-2 rounded-xl bg-black/60 border border-white/5 p-4 relative group/code overflow-x-auto max-w-full font-mono text-[11px] leading-relaxed text-slate-300">
                              {/* Copy Button */}
                              <button
                                onClick={() => handleCopyText(item.details || "", idx)}
                                className="absolute right-3 top-3 opacity-0 group-hover/code:opacity-100 p-1.5 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
                                title="Скопировать"
                              >
                                {copiedIdx === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <pre className="whitespace-pre-wrap font-sans text-slate-400">
                                {item.details}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fallback Warning Box */}
          {error && (
            <div className="mt-6 p-4 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                  Плавный обход сбоя (Error Fallback)
                </h5>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Поскольку поток AniBoom не смог запуститься (ошибка: {error}), система автоматически переключила вас на альтернативный видеоплеер. Вы можете нажать кнопку <strong className="text-white">"Сбросить кэш и перезапустить"</strong> выше, чтобы повторить попытку парсинга.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
