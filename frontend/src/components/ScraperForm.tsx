import { useState } from "react";
import { mockApi } from "@/api/mock";
import { Prospect, ProspectSource } from "@/api/prospects";
import { supabase, isSupabaseConfigured } from "@/api/supabase";
import { useWorkspace, NAF_CATALOG, WorkspaceConfig } from "@/hooks/useWorkspace";
import { Search, Loader2, CheckCircle, Upload, AlertTriangle, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// ── Backend URL ────────────────────────────────────────────────────────────────
function getBackendUrl(): string {
  return (localStorage.getItem("trakr_backend_url") || "").replace(/\/$/, "");
}

// ── Sirène API (public, no key) ────────────────────────────────────────────────
function nafWithDot(code: string): string {
  if (code.length === 5 && !code.includes(".")) {
    return code.slice(0, 2) + "." + code.slice(2);
  }
  return code;
}

async function searchSirene(naf: string, postal: string, dept: string, maxResults = 50): Promise<Partial<Prospect>[]> {
  const params = new URLSearchParams({
    q: NAF_CATALOG.find(o => o.code === naf)?.label || naf,
    activite_principale: nafWithDot(naf),
    per_page: String(Math.min(maxResults, 25)),
    page: "1",
  });
  if (postal) params.set("code_postal", postal);
  if (dept) params.set("departement", dept);

  const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Erreur API INSEE: ${res.status}${body ? " — " + body.slice(0, 100) : ""}`);
  }
  const json = await res.json();

  const totalPages = Math.min(Math.ceil(maxResults / 25), Math.ceil((json.total_results ?? 0) / 25));
  let allResults = json.results ?? [];
  for (let page = 2; page <= totalPages && allResults.length < maxResults; page++) {
    params.set("page", String(page));
    const r2 = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${params}`);
    if (r2.ok) {
      const j2 = await r2.json();
      allResults = [...allResults, ...(j2.results ?? [])];
    }
  }

  return allResults.slice(0, maxResults).map((r: any) => {
    const siege = r.siege ?? {};
    const tel = siege.telephone || r.telephone || undefined;
    return {
      raison_sociale: r.nom_raison_sociale || r.nom_complet || "—",
      nom_commercial: r.nom_commercial || undefined,
      siret: siege.siret || undefined,
      adresse: siege.adresse || undefined,
      code_postal: siege.code_postal || undefined,
      ville: siege.libelle_commune || undefined,
      code_naf: (r.activite_principale || "").replace(".", "") || naf,
      effectif: siege.tranche_effectif_salarie ? parseEffectif(siege.tranche_effectif_salarie) : undefined,
      tel: tel ? normalizePhone(tel) : undefined,
      source: "sirene" as ProspectSource,
      status: "new" as const,
      email_verified: false,
      unsubscribed: false,
    };
  });
}

function parseEffectif(tranche: string): number {
  const map: Record<string, number> = {
    "00": 0, "01": 2, "02": 5, "03": 9, "11": 15, "12": 25,
    "21": 40, "22": 75, "31": 150, "32": 350, "41": 750, "42": 1500,
    "51": 3500, "52": 7500, "53": 15000,
  };
  return map[tranche] ?? 10;
}

function normalizePhone(tel: string): string {
  const digits = tel.replace(/\D/g, "");
  if (digits.startsWith("33")) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+33" + digits.slice(1);
  return tel;
}

// ── Google Maps scraper — appel au backend Playwright ─────────────────────────
async function searchGoogleMaps(keyword: string, city: string, maxResults: number): Promise<Partial<Prospect>[]> {
  const base = getBackendUrl();
  if (!base) throw new Error("NO_BACKEND");

  const res = await fetch(`${base}/api/scraper/google-maps/playwright`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(localStorage.getItem("trakr_scraper_key")
        ? { "X-Api-Key": localStorage.getItem("trakr_scraper_key")! }
        : {}),
    },
    body: JSON.stringify({ keyword, city, max_results: maxResults }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Erreur backend: ${res.status}`);
  }

  const json = await res.json();
  return (json.results ?? []).map((r: any) => ({
    ...r,
    source: "google_maps" as ProspectSource,
    status: "new" as const,
    email_verified: false,
    unsubscribed: false,
  }));
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text: string): Partial<Prospect>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, "").toLowerCase());

  const get = (row: string[], keys: string[]): string | undefined => {
    for (const k of keys) {
      const idx = headers.findIndex(h => h.includes(k));
      if (idx >= 0 && row[idx]) return row[idx].trim().replace(/"/g, "");
    }
    return undefined;
  };

  return lines.slice(1).map(line => {
    const cols = line.split(",");
    return {
      raison_sociale: get(cols, ["company", "entreprise", "société", "raison", "nom"]) || "Import CSV",
      email: get(cols, ["email", "courriel", "e-mail"]),
      tel: get(cols, ["phone", "tel", "téléphone", "mobile"]),
      ville: get(cols, ["city", "ville", "localité"]),
      code_postal: get(cols, ["postal", "zip", "cp", "code postal"]),
      adresse: get(cols, ["address", "adresse"]),
      contact_prenom: get(cols, ["first name", "prénom", "prenom"]),
      contact_nom: get(cols, ["last name", "nom de famille"]),
      contact_titre: get(cols, ["title", "titre", "poste", "fonction"]),
      site_web: get(cols, ["website", "site", "url"]),
      linkedin_url: get(cols, ["linkedin", "profile"]),
      source: "linkedin" as ProspectSource,
      status: "new" as const,
      email_verified: false,
      unsubscribed: false,
    };
  }).filter(p => p.raison_sociale !== "Import CSV" || p.email);
}

// ── Save prospects ─────────────────────────────────────────────────────────────
async function saveProspects(
  items: Partial<Prospect>[],
  activeWs: WorkspaceConfig
): Promise<number> {
  let saved = 0;
  if (isSupabaseConfigured) {
    const toInsert = items.map(p => ({
      ...p,
      icp_score: computeIcp(p, activeWs),
      status: "new",
      email_verified: false,
      unsubscribed: false,
    }));
    const { data, error } = await supabase.from("prospects").insert(toInsert).select();
    if (error) throw new Error(error.message);
    saved = (data ?? []).length;
  } else {
    for (const item of items) {
      mockApi.prospects.create({ ...item, icp_score: computeIcp(item, activeWs) });
      saved++;
    }
  }
  return saved;
}

// ── ICP scoring (uses workspace criteria) ──────────────────────────────────────
function computeIcp(p: Partial<Prospect>, active: WorkspaceConfig): number {
  let score = 0;
  if (p.code_naf && active.naf_codes.includes(p.code_naf)) score += 30;
  const eff = p.effectif ?? 0;
  if (eff >= active.icp_effectif_min && eff <= active.icp_effectif_max) score += 20;
  if (p.tel) score += 20;
  if (p.email) score += 15;
  if (p.siret) score += 15;
  return Math.min(score, 100);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ScraperForm() {
  const ws = useWorkspace();
  const active = ws.active();
  const nafOptions = ws.activeNafOptions();

  const [tab, setTab] = useState<"sirene" | "csv" | "google" | "pj">("sirene");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sirene — default to first NAF code of active workspace
  const [sNaf, setSNaf] = useState(() => nafOptions[0]?.code ?? "5610A");
  const [sPostal, setSPostal] = useState("");
  const [sDept, setSDept] = useState("");
  const [sMax, setSMax] = useState(50);

  // Google Maps
  const [gmKeyword, setGmKeyword] = useState("restaurant");
  const [gmCity, setGmCity] = useState("");
  const [gmMax, setGmMax] = useState(50);

  // PagesJaunes
  const [pjQuoi, setPjQuoi] = useState("restaurant");
  const [pjOu, setPjOu] = useState("");

  // CSV
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const backendConfigured = !!getBackendUrl();

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (tab === "sirene") {
        const items = await searchSirene(sNaf, sPostal, sDept, sMax);
        if (items.length === 0) throw new Error("Aucun résultat — essayez un autre département ou code postal.");
        const saved = await saveProspects(items, active);
        setResult(`${saved} prospects collectés depuis Sirène INSEE et ajoutés au pipeline.`);

      } else if (tab === "csv") {
        if (!csvFile) throw new Error("Sélectionnez un fichier CSV.");
        const text = await csvFile.text();
        const items = parseCSV(text);
        if (items.length === 0) throw new Error("Le fichier est vide ou le format n'est pas reconnu.");
        const saved = await saveProspects(items, active);
        setResult(`${saved} prospects importés depuis ${csvFile.name}.`);

      } else if (tab === "google") {
        if (!gmKeyword.trim()) throw new Error("Entrez un mot-clé.");
        if (!gmCity.trim()) throw new Error("Entrez une ville.");
        const items = await searchGoogleMaps(gmKeyword.trim(), gmCity.trim(), gmMax);
        if (items.length === 0) throw new Error("Aucun résultat — essayez un autre mot-clé ou une ville plus grande.");
        const saved = await saveProspects(items, active);
        setResult(`${saved} établissements collectés depuis Google Maps et ajoutés au pipeline.`);

      } else if (tab === "pj") {
        if (!pjQuoi.trim() || !pjOu.trim()) throw new Error("Remplissez l'activité et la localisation.");
        // PagesJaunes uses same backend
        const base = getBackendUrl();
        if (!base) throw new Error("NO_BACKEND");
        const res = await fetch(`${base}/api/scraper/pages-jaunes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoi: pjQuoi, ou: pjOu, max_pages: 5 }),
        });
        if (!res.ok) throw new Error("Erreur backend PagesJaunes");
        const json = await res.json();
        setResult(`Tâche lancée (ID: ${json.task_id}). Les résultats arriveront dans quelques minutes.`);
      }
    } catch (e: any) {
      if (e.message === "NO_BACKEND") {
        setError("__NO_BACKEND__");
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const TABS = [
    { id: "sirene", label: "Sirène INSEE", badge: { text: "Gratuit", cls: "bg-green-100 text-green-700" } },
    { id: "csv",    label: "Import CSV",   badge: null },
    { id: "google", label: "Google Maps",  badge: null },
    { id: "pj",     label: "PagesJaunes", badge: null },
  ] as const;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setResult(null); setError(null); }}
            className={cn(
              "flex-1 text-xs py-3 font-medium transition-colors relative",
              tab === t.id
                ? "border-b-2 border-blue-600 text-blue-600 bg-blue-50"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
            {t.badge && (
              <span className={cn("ml-1 text-[10px] px-1.5 py-0.5 rounded font-semibold", t.badge.cls)}>
                {t.badge.text}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-4">

        {/* ── Sirène INSEE ── */}
        {tab === "sirene" && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
              Collecte directe depuis l'API officielle du gouvernement français — aucune clé requise.
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Code NAF / Secteur
                <span className="ml-1 text-[11px] text-slate-400 font-normal">
                  (codes de l'espace «{active.name}»)
                </span>
              </label>
              {nafOptions.length === 0 ? (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Aucun code NAF sélectionné pour cet espace. Configurez-les dans{" "}
                  <Link to="/settings" className="underline font-medium">Paramètres</Link>.
                </div>
              ) : (
                <select value={sNaf} onChange={e => setSNaf(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {nafOptions.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code postal (optionnel)" value={sPostal} onChange={setSPostal} placeholder="ex: 75001" />
              <Field label="Département (optionnel)" value={sDept} onChange={setSDept} placeholder="ex: 75, 69, 13…" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nombre max de résultats</label>
              <input type="number" value={sMax} onChange={e => setSMax(Number(e.target.value))}
                min={10} max={200} step={10}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </>
        )}

        {/* ── Import CSV ── */}
        {tab === "csv" && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800 mb-3">
              Importez n'importe quel CSV (LinkedIn Sales Navigator, exports CRM…). Les colonnes sont détectées automatiquement.
            </div>
            <label className={cn(
              "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors",
              csvFile ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400"
            )}>
              <Upload size={24} className={csvFile ? "text-blue-500" : "text-slate-400"} />
              <span className="text-sm text-slate-600 text-center">
                {csvFile ? csvFile.name : "Cliquez pour sélectionner un fichier .csv"}
              </span>
              <span className="text-xs text-slate-400">company, email, phone, city, first name, last name…</span>
              <input type="file" accept=".csv,.txt" className="hidden"
                onChange={e => setCsvFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        )}

        {/* ── Google Maps ── */}
        {tab === "google" && (
          <>
            {!backendConfigured ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <Settings size={18} className="text-blue-600" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Backend non configuré</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Le scraping Google Maps utilise un navigateur piloté côté serveur.<br/>
                  Configurez l'URL du backend dans les Paramètres pour l'activer.
                </p>
                <Link to="/settings"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 underline">
                  <Settings size={12} />
                  Ouvrir les Paramètres
                </Link>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
                  Scraping via navigateur piloté — nom, adresse, téléphone, site web, note collectés automatiquement.
                </div>
                <Field label="Mot-clé" value={gmKeyword} onChange={setGmKeyword} placeholder="ex: restaurant, hôtel, garage, pharmacie…" />
                <Field label="Ville / Zone" value={gmCity} onChange={setGmCity} placeholder="ex: Lyon, Paris 11e, Bordeaux…" />
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre de résultats</label>
                  <input type="number" value={gmMax} onChange={e => setGmMax(Number(e.target.value))}
                    min={10} max={120} step={10}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </>
            )}
          </>
        )}

        {/* ── PagesJaunes ── */}
        {tab === "pj" && (
          <>
            {!backendConfigured ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <Settings size={18} className="text-blue-600" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Backend non configuré</p>
                <p className="text-xs text-slate-500">
                  PagesJaunes nécessite le backend FastAPI.<br/>
                  Configurez l'URL dans les Paramètres.
                </p>
                <Link to="/settings"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 underline">
                  <Settings size={12} />
                  Ouvrir les Paramètres
                </Link>
              </div>
            ) : (
              <>
                <Field label="Activité (quoi)" value={pjQuoi} onChange={setPjQuoi} placeholder="ex: restaurant, hôtel…" />
                <Field label="Localisation (où)" value={pjOu} onChange={setPjOu} placeholder="ex: Paris, Lyon…" />
              </>
            )}
          </>
        )}

        {/* Feedback */}
        {error && error !== "__NO_BACKEND__" && (
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {result && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle size={14} className="shrink-0" />
            {result}
          </div>
        )}

        {/* Submit — hidden when no backend and tab needs it */}
        {!(["google", "pj"].includes(tab) && !backendConfigured) && (
          <button onClick={run} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {loading
              ? tab === "google" ? "Navigation en cours… (1-3 min)" : "Collecte en cours…"
              : "Lancer la collecte"}
          </button>
        )}
      </div>

      {/* Info footer */}
      <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-500 leading-relaxed">
        <strong className="text-slate-700">Sirène INSEE</strong> fonctionne directement dans le navigateur — gratuit et sans clé API.{" "}
        <strong className="text-slate-700">Google Maps</strong> et <strong className="text-slate-700">PagesJaunes</strong>{" "}
        utilisent le backend Playwright.
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}
