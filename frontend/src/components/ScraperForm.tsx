import { useState } from "react";
import { scraperApi, TaskResponse } from "@/api/scraper";
import { Search, Loader2, CheckCircle, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const NAF_OPTIONS = [
  { code: "5610A", label: "5610A — Restauration rapide" },
  { code: "5610C", label: "5610C — Restauration traditionnelle" },
  { code: "5630Z", label: "5630Z — Débits de boissons" },
  { code: "5510Z", label: "5510Z — Hôtellerie" },
  { code: "4711D", label: "4711D — Supermarchés" },
  { code: "1013A", label: "1013A — IAA Viande" },
  { code: "1089Z", label: "1089Z — IAA Autres" },
];

export default function ScraperForm() {
  const [tab, setTab] = useState<"google" | "pj" | "sirene" | "linkedin">("google");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Google Maps fields
  const [gmKeyword, setGmKeyword] = useState("restaurant");
  const [gmCity, setGmCity] = useState("");
  const [gmRadius, setGmRadius] = useState(10);

  // PagesJaunes fields
  const [pjQuoi, setPjQuoi] = useState("restaurant");
  const [pjOu, setPjOu] = useState("");
  const [pjPages, setPjPages] = useState(5);

  // Sirene fields
  const [sNaf, setSNaf] = useState("5610A");
  const [sPostal, setSPostal] = useState("");
  const [sDept, setSDept] = useState("");

  // LinkedIn
  const [linkedInFile, setLinkedInFile] = useState<File | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let res: TaskResponse;
      if (tab === "google") {
        res = await scraperApi.googleMaps(gmKeyword, gmCity, gmRadius);
      } else if (tab === "pj") {
        res = await scraperApi.pagesJaunes(pjQuoi, pjOu, pjPages);
      } else if (tab === "sirene") {
        res = await scraperApi.sirene(sNaf, sPostal || undefined, sDept || undefined);
      } else {
        if (!linkedInFile) { setError("Sélectionnez un fichier CSV"); setLoading(false); return; }
        const imported = await scraperApi.importLinkedIn(linkedInFile);
        setResult({ task_id: "csv", message: `Importé: ${imported.imported} | Ignorés: ${imported.skipped}` });
        setLoading(false);
        return;
      }
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const TABS = [
    { id: "google", label: "Google Maps" },
    { id: "pj", label: "PagesJaunes" },
    { id: "sirene", label: "Sirène INSEE" },
    { id: "linkedin", label: "LinkedIn CSV" },
  ] as const;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 text-sm py-3 font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-blue-600 text-blue-600 bg-blue-50"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-4">
        {tab === "google" && (
          <>
            <Field label="Mot-clé" value={gmKeyword} onChange={setGmKeyword} placeholder="ex: restaurant, hôtel…" />
            <Field label="Ville / Zone" value={gmCity} onChange={setGmCity} placeholder="ex: Paris, Lyon…" />
            <NumberField label="Rayon (km)" value={gmRadius} onChange={setGmRadius} />
          </>
        )}

        {tab === "pj" && (
          <>
            <Field label="Activité (quoi)" value={pjQuoi} onChange={setPjQuoi} placeholder="ex: restaurant, hôtel…" />
            <Field label="Localisation (où)" value={pjOu} onChange={setPjOu} placeholder="ex: Paris 75, Rhône 69…" />
            <NumberField label="Nombre de pages max" value={pjPages} onChange={setPjPages} max={10} />
          </>
        )}

        {tab === "sirene" && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Code NAF</label>
              <select
                value={sNaf}
                onChange={(e) => setSNaf(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {NAF_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </select>
            </div>
            <Field label="Code postal (optionnel)" value={sPostal} onChange={setSPostal} placeholder="ex: 75001" />
            <Field label="Département (optionnel)" value={sDept} onChange={setSDept} placeholder="ex: 75, 69, 13…" />
          </>
        )}

        {tab === "linkedin" && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">
              Fichier CSV (export Sales Navigator)
            </label>
            <label className={cn(
              "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors",
              linkedInFile ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400"
            )}>
              <Upload size={24} className={linkedInFile ? "text-blue-500" : "text-slate-400"} />
              <span className="text-sm text-slate-500">
                {linkedInFile ? linkedInFile.name : "Cliquer pour sélectionner un fichier .csv"}
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setLinkedInFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        {result && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle size={14} />
            {result.message}
            {result.task_id !== "csv" && (
              <span className="text-xs text-green-500 ml-1">• Tâche: {result.task_id.slice(0, 8)}…</span>
            )}
          </div>
        )}

        <button
          onClick={run}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? "Lancement en cours…" : "Lancer la collecte"}
        </button>
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
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function NumberField({ label, value, onChange, max }: {
  label: string; value: number; onChange: (v: number) => void; max?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={1}
        max={max}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
