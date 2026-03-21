import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, X, Loader2 } from "lucide-react";
import { useScraper } from "@/contexts/ScraperContext";
import { cn } from "@/lib/utils";

export default function ScraperPopup() {
  const { state, cancel, dismiss } = useScraper();
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages to bottom
  useEffect(() => {
    if (!minimized && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [state.messages, minimized]);

  // Don't render if no scrape has been started
  if (!state.isRunning && !state.isDone && !state.error) return null;

  const progressPercent = state.isDone
    ? 100
    : state.totalUrls > 0
    ? Math.min(((state.currentUrlIndex + 1) / state.totalUrls) * 100, 95)
    : null;

  // Minimized pill
  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2.5 bg-slate-900 text-white pl-3 pr-4 py-2 rounded-full shadow-2xl border border-slate-700 hover:bg-slate-800 transition-colors"
        >
          {state.isRunning && (
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
          )}
          {state.isDone && (
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          )}
          {state.error && (
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
          )}
          <span className="text-xs font-medium">
            {state.isDone
              ? `${state.found} résultats`
              : state.error
              ? "Erreur scraping"
              : `${state.found} trouvés…`}
          </span>
          <ChevronUp size={12} className="text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 min-w-80 max-w-sm w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 w-full bg-slate-800 relative overflow-hidden">
        {state.isDone ? (
          <div className="h-full w-full bg-blue-500 transition-all duration-500" />
        ) : state.isRunning ? (
          progressPercent !== null ? (
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          ) : (
            <div className="h-full bg-blue-500 animate-pulse w-full" />
          )
        ) : state.error ? (
          <div className="h-full w-1/3 bg-red-500" />
        ) : null}
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white truncate">
            {state.keyword && state.city
              ? `${state.keyword} · ${state.city}`
              : "Scraping Google Maps"}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {state.isRunning && (
              <Loader2 size={10} className="text-blue-400 animate-spin shrink-0" />
            )}
            <span className={cn(
              "text-[10px]",
              state.isRunning ? "text-blue-400" : state.isDone ? "text-green-400" : "text-red-400"
            )}>
              {state.isRunning ? "En cours" : state.isDone ? "Terminé" : "Erreur"}
            </span>
          </div>
        </div>
        <button
          onClick={() => setMinimized(true)}
          className="text-slate-400 hover:text-white transition-colors p-1 rounded"
          title="Réduire"
        >
          <ChevronDown size={14} />
        </button>
        {!state.isRunning && (
          <button
            onClick={dismiss}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded"
            title="Fermer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Big number */}
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-white tabular-nums leading-none">
            {state.found}
          </span>
          <span className="text-xs text-slate-400 mb-0.5">établissements trouvés</span>
        </div>

        {/* Current action */}
        {state.currentAction && (
          <p className="text-xs text-slate-400 italic truncate leading-tight">
            {state.currentAction}
          </p>
        )}

        {/* Error */}
        {state.error && (
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded px-2 py-1.5 leading-tight">
            {state.error}
          </p>
        )}

        {/* Messages log */}
        {state.messages.length > 0 && (
          <div className="max-h-32 overflow-y-auto border-l-2 border-slate-700 pl-2 space-y-0.5 scrollbar-thin">
            {state.messages.slice(-8).map((msg, i) => (
              <div
                key={i}
                className="text-[11px] font-mono text-slate-400 leading-tight break-words"
              >
                {msg}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      {(state.isRunning || state.isDone) && (
        <div className="px-4 py-2.5 border-t border-slate-800 flex items-center gap-2">
          {state.isRunning && (
            <button
              onClick={cancel}
              className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded border border-red-900/50 hover:border-red-800"
            >
              Annuler
            </button>
          )}
          {state.isDone && (
            <Link
              to="/scraper"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              Voir les résultats →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
