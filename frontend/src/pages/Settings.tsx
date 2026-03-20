import { useState, useMemo } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/api/supabase";
import { useWorkspace, NAF_CATALOG, WorkspaceConfig } from "@/hooks/useWorkspace";
import {
  User, Shield, Database, CheckCircle, XCircle, Server,
  Eye, EyeOff, Plus, Trash2, Copy, Palette, Building2, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

// Group NAF catalog by sector
const NAF_BY_SECTOR = NAF_CATALOG.reduce<Record<string, typeof NAF_CATALOG>>((acc, n) => {
  (acc[n.sector] ??= []).push(n);
  return acc;
}, {});

export default function SettingsPage() {
  const { user } = useAuthStore();
  const ws = useWorkspace();

  // Backend state
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem("trakr_backend_url") || "");
  const [scraperKey, setScraperKey] = useState(() => localStorage.getItem("trakr_scraper_key") || "");
  const [showKey, setShowKey] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"idle" | "ok" | "error">("idle");
  const [saved, setSaved] = useState(false);

  // Workspace UI
  const [nafSearch, setNafSearch] = useState("");
  const [newWsName, setNewWsName] = useState("");
  const [addingWs, setAddingWs] = useState(false);

  const active = ws.active();

  const filteredNaf = useMemo(() => {
    if (!nafSearch.trim()) return NAF_BY_SECTOR;
    const q = nafSearch.toLowerCase();
    const result: Record<string, typeof NAF_CATALOG> = {};
    for (const [sector, codes] of Object.entries(NAF_BY_SECTOR)) {
      const matches = codes.filter(
        n => n.code.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)
      );
      if (matches.length) result[sector] = matches;
    }
    return result;
  }, [nafSearch]);

  const toggleNaf = (code: string) => {
    const current = active.naf_codes;
    const next = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code];
    ws.update(active.id, { naf_codes: next });
  };

  const testBackend = async () => {
    const url = backendUrl.replace(/\/$/, "");
    if (!url) return;
    try {
      const res = await fetch(url + "/api/health", { signal: AbortSignal.timeout(5000) });
      setBackendStatus(res.ok ? "ok" : "error");
    } catch {
      setBackendStatus("error");
    }
  };

  const saveBackend = () => {
    localStorage.setItem("trakr_backend_url", backendUrl.replace(/\/$/, ""));
    localStorage.setItem("trakr_scraper_key", scraperKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    testBackend();
  };

  const handleCreateWs = () => {
    if (!newWsName.trim()) return;
    ws.create(newWsName.trim());
    setNewWsName("");
    setAddingWs(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Paramètres</h1>

      {/* ── Workspace tabs ── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Building2 size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Espaces de travail (sociétés)</h2>
          <button
            onClick={() => setAddingWs(v => !v)}
            className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus size={13} /> Nouveau
          </button>
        </div>

        {/* Add workspace form */}
        {addingWs && (
          <div className="px-5 py-3 border-b border-slate-100 bg-blue-50 flex gap-2">
            <input
              autoFocus
              value={newWsName}
              onChange={e => setNewWsName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateWs()}
              placeholder="Nom de la société..."
              className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={handleCreateWs}
              className="px-4 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-medium">
              Créer
            </button>
            <button onClick={() => { setAddingWs(false); setNewWsName(""); }}
              className="px-3 py-1.5 border border-slate-200 text-xs rounded-lg hover:bg-slate-50">
              Annuler
            </button>
          </div>
        )}

        {/* Workspace list */}
        <div className="flex gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
          {ws.workspaces.map(w => (
            <button
              key={w.id}
              onClick={() => ws.setActive(w.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                w.id === ws.activeId
                  ? "border-transparent text-white shadow-sm"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
              )}
              style={w.id === ws.activeId ? { backgroundColor: w.color } : {}}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: w.id === ws.activeId ? "rgba(255,255,255,0.6)" : w.color }}
              />
              {w.name}
            </button>
          ))}
        </div>

        {/* Active workspace editor */}
        <div className="p-5 space-y-5">
          {/* Name + color */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Nom de la société</label>
              <input
                value={active.name}
                onChange={e => ws.update(active.id, { name: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Couleur</label>
              <div className="flex gap-1.5">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => ws.update(active.id, { color: c })}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all",
                      active.color === c ? "border-slate-800 scale-110" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ICP criteria */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Critères ICP (profil client idéal)</label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Effectif min</label>
                <input
                  type="number"
                  min={0}
                  value={active.icp_effectif_min}
                  onChange={e => ws.update(active.id, { icp_effectif_min: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Effectif max</label>
                <input
                  type="number"
                  min={0}
                  value={active.icp_effectif_max}
                  onChange={e => ws.update(active.id, { icp_effectif_max: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-4">
              {[
                { key: "icp_require_tel", label: "Téléphone obligatoire" },
                { key: "icp_require_email", label: "Email obligatoire" },
                { key: "icp_require_site", label: "Site web obligatoire" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active[key as keyof WorkspaceConfig] as boolean}
                    onChange={e => ws.update(active.id, { [key]: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-600">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* NAF codes selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-600">
                Codes NAF ciblés
                <span className="ml-2 text-[11px] text-slate-400 font-normal">
                  {active.naf_codes.length} sélectionné{active.naf_codes.length > 1 ? "s" : ""}
                </span>
              </label>
              {active.naf_codes.length > 0 && (
                <button
                  onClick={() => ws.update(active.id, { naf_codes: [] })}
                  className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  Tout désélectionner
                </button>
              )}
            </div>

            {/* Selected codes pills */}
            {active.naf_codes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {active.naf_codes.map(code => {
                  const entry = NAF_CATALOG.find(n => n.code === code);
                  return (
                    <span key={code}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium"
                      style={{ backgroundColor: active.color }}
                    >
                      <span className="font-mono">{code}</span>
                      {entry && <span className="opacity-80">— {entry.label}</span>}
                      <button onClick={() => toggleNaf(code)} className="ml-0.5 opacity-70 hover:opacity-100">×</button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <input
              value={nafSearch}
              onChange={e => setNafSearch(e.target.value)}
              placeholder="Rechercher un code NAF ou secteur…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />

            {/* Grouped list */}
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              {Object.entries(filteredNaf).map(([sector, codes]) => (
                <div key={sector}>
                  <div className="sticky top-0 bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    {sector}
                  </div>
                  {codes.map(n => (
                    <label key={n.code}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors text-xs",
                        active.naf_codes.includes(n.code)
                          ? "bg-blue-50"
                          : "hover:bg-slate-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={active.naf_codes.includes(n.code)}
                        onChange={() => toggleNaf(n.code)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-mono text-slate-500 shrink-0 w-14">{n.code}</span>
                      <span className="text-slate-700">{n.label}</span>
                    </label>
                  ))}
                </div>
              ))}
              {Object.keys(filteredNaf).length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  Aucun résultat pour « {nafSearch} »
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes internes</label>
            <textarea
              value={active.notes}
              onChange={e => ws.update(active.id, { notes: e.target.value })}
              rows={3}
              placeholder="Ex: Secteur CHR Paris + banlieue, priorité établissements > 5 salariés…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => ws.duplicate(active.id)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <Copy size={12} /> Dupliquer
            </button>
            {ws.workspaces.length > 1 && (
              <button
                onClick={() => ws.remove(active.id)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
              >
                <Trash2 size={12} /> Supprimer
              </button>
            )}
            <span className="ml-auto text-[11px] text-slate-400 self-center">
              Créé le {new Date(active.created_at).toLocaleDateString("fr-FR")}
            </span>
          </div>
        </div>
      </section>

      {/* ── Backend Playwright ── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Server size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Backend Playwright</h2>
          <span className="ml-auto text-xs text-slate-400">Google Maps · PagesJaunes</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Le scraping Google Maps utilise un serveur Python (FastAPI + Playwright) déployé sur Railway.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">URL du backend</label>
            <div className="flex gap-2">
              <input
                value={backendUrl}
                onChange={e => { setBackendUrl(e.target.value); setBackendStatus("idle"); }}
                placeholder="https://trakr-production-cfae.up.railway.app"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={testBackend}
                className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap">
                Tester
              </button>
            </div>
            {backendStatus === "ok" && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle size={12} /> Backend en ligne ✓
              </p>
            )}
            {backendStatus === "error" && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <XCircle size={12} /> Connexion échouée — vérifiez l'URL
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Clé secrète (optionnel)</label>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={scraperKey}
                onChange={e => setScraperKey(e.target.value)}
                placeholder="Laissez vide si non configurée"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => setShowKey(s => !s)}
                className="px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button onClick={saveBackend}
            className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            {saved ? "✓ Enregistré" : "Enregistrer"}
          </button>
        </div>
      </section>

      {/* ── Supabase Status ── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Database size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Base de données Supabase</h2>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3">
            {isSupabaseConfigured ? (
              <>
                <CheckCircle size={18} className="text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700">Supabase connecté</p>
                  <p className="text-xs text-slate-400">Les données sont stockées en base de données.</p>
                </div>
              </>
            ) : (
              <>
                <XCircle size={18} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700">Mode démo (localStorage)</p>
                  <p className="text-xs text-slate-400">
                    Ajoutez <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_URL</code> et{" "}
                    <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> dans Vercel pour activer Supabase.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Profile ── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <User size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Profil utilisateur</h2>
        </div>
        <div className="p-5 space-y-4">
          <Row label="Nom complet" value={user?.full_name ?? "—"} />
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Rôle" value={user?.is_admin ? "Administrateur" : "Utilisateur"} />
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}
