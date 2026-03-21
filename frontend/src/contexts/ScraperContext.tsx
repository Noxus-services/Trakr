import React, { createContext, useContext, useRef, useState, useCallback } from "react";

// ── Backend URL ─────────────────────────────────────────────────────────────────
const DEFAULT_BACKEND_URL = "https://trakr-production-cfae.up.railway.app";
function getBackendUrl(): string {
  return (localStorage.getItem("trakr_backend_url") || DEFAULT_BACKEND_URL).replace(/\/$/, "");
}

// ── Types ───────────────────────────────────────────────────────────────────────
export interface ScraperState {
  isRunning: boolean;
  keyword: string;
  city: string;
  found: number;
  totalUrls: number;
  currentUrlIndex: number;
  currentCompany: string;
  currentAction: string;
  messages: string[];
  results: any[];
  error: string | null;
  startTime: number | null;
  isDone: boolean;
}

export interface StartScrapingParams {
  keyword: string;
  city: string;
  max_results: number;
  use_grid: boolean;
  radius_km: number;
  step_km: number;
}

interface ScraperContextValue {
  state: ScraperState;
  startScraping: (params: StartScrapingParams, onDone?: (results: any[]) => void) => void;
  cancel: () => void;
  dismiss: () => void;
}

// ── Initial state ───────────────────────────────────────────────────────────────
const initialState: ScraperState = {
  isRunning: false,
  keyword: "",
  city: "",
  found: 0,
  totalUrls: 0,
  currentUrlIndex: 0,
  currentCompany: "",
  currentAction: "",
  messages: [],
  results: [],
  error: null,
  startTime: null,
  isDone: false,
};

// ── Context ─────────────────────────────────────────────────────────────────────
const ScraperContext = createContext<ScraperContextValue | null>(null);

export function useScraper(): ScraperContextValue {
  const ctx = useContext(ScraperContext);
  if (!ctx) throw new Error("useScraper must be used inside <ScraperProvider>");
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────────
export function ScraperProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScraperState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const pushMessage = useCallback((msg: string) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages.slice(-19), msg],
    }));
  }, []);

  const startScraping = useCallback(
    (params: StartScrapingParams, onDone?: (results: any[]) => void) => {
      // Cancel any existing scrape
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const abort = new AbortController();
      abortRef.current = abort;

      setState({
        ...initialState,
        isRunning: true,
        keyword: params.keyword,
        city: params.city,
        startTime: Date.now(),
        currentAction: "Initialisation…",
      });

      const base = getBackendUrl();
      const url = `${base}/api/scraper/google-maps/stream`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const apiKey = localStorage.getItem("trakr_scraper_key");
      if (apiKey) headers["X-Api-Key"] = apiKey;

      (async () => {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
              keyword: params.keyword,
              city: params.city,
              max_results: params.max_results,
              use_grid: params.use_grid,
              radius_km: params.radius_km,
              step_km: params.step_km,
            }),
            signal: abort.signal,
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: response.statusText }));
            setState(prev => ({
              ...prev,
              isRunning: false,
              error: err.detail || `Erreur backend: ${response.status}`,
            }));
            return;
          }

          if (!response.body) {
            setState(prev => ({
              ...prev,
              isRunning: false,
              error: "Réponse vide du serveur",
            }));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (!raw) continue;

              let event: any;
              try {
                event = JSON.parse(raw);
              } catch {
                continue;
              }

              switch (event.type) {
                case "start":
                  setState(prev => ({
                    ...prev,
                    totalUrls: event.total_urls ?? 1,
                    currentAction: "Démarrage…",
                  }));
                  pushMessage(`Démarrage — ${event.keyword} à ${event.city} (${event.total_urls} zone(s))`);
                  break;

                case "searching":
                  setState(prev => ({
                    ...prev,
                    currentUrlIndex: event.url_index ?? 0,
                    currentAction: `Zone ${(event.url_index ?? 0) + 1}/${event.total_urls} — navigation…`,
                  }));
                  pushMessage(`Zone ${(event.url_index ?? 0) + 1}/${event.total_urls} — navigation…`);
                  break;

                case "company":
                  setState(prev => ({
                    ...prev,
                    found: event.found ?? prev.found,
                    currentCompany: event.name ?? "",
                    currentAction: event.name ?? "",
                  }));
                  pushMessage(`📋 ${event.name}`);
                  break;

                case "enriching":
                  setState(prev => ({
                    ...prev,
                    currentAction: `🔍 Enrichissement — ${event.name}`,
                  }));
                  pushMessage(`🔍 Enrichissement — ${event.name}`);
                  break;

                case "contact":
                  setState(prev => ({
                    ...prev,
                    currentAction: `✉️ Email trouvé : ${event.email}`,
                  }));
                  pushMessage(`✉️ Email trouvé : ${event.email}`);
                  break;

                case "done":
                  setState(prev => ({
                    ...prev,
                    isRunning: false,
                    isDone: true,
                    found: event.count ?? prev.found,
                    results: event.results ?? [],
                    currentAction: `Terminé — ${event.count} établissements`,
                  }));
                  pushMessage(`Terminé — ${event.count} établissements collectés`);
                  if (onDone) {
                    onDone(event.results ?? []);
                  }
                  break;

                case "error":
                  setState(prev => ({
                    ...prev,
                    isRunning: false,
                    error: event.detail ?? "Erreur inconnue",
                  }));
                  break;

                case "debug":
                  // Messages de debug (ex: "Pas de feed — titre: ..., url: ...")
                  pushMessage(`⚠️ ${event.msg}`);
                  break;

                case "ping":
                  // ignore
                  break;

                default:
                  break;
              }
            }
          }
        } catch (e: any) {
          if (e.name === "AbortError") return;
          setState(prev => ({
            ...prev,
            isRunning: false,
            error: e.message ?? "Erreur réseau",
          }));
        }
      })();
    },
    [pushMessage]
  );

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isRunning: false,
      currentAction: "Annulé",
    }));
  }, []);

  const dismiss = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState(initialState);
  }, []);

  return (
    <ScraperContext.Provider value={{ state, startScraping, cancel, dismiss }}>
      {children}
    </ScraperContext.Provider>
  );
}
