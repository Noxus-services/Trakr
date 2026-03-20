import { useState } from "react";
import { useProspects } from "@/hooks/useProspects";
import { Prospect, ProspectStatus, ProspectSource } from "@/api/prospects";
import { mockApi } from "@/api/mock";
import ProspectDrawer from "@/components/ProspectDrawer";
import { Plus, Search, RefreshCw } from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS, NAF_LABELS, icpColor, SOURCE_LABELS } from "@/lib/utils";

const NAF_CODES = ["5610A", "5610C", "5630Z", "5510Z", "4711D", "1013A", "1089Z"];
const SOURCES: ProspectSource[] = ["google_maps", "pages_jaunes", "sirene", "linkedin", "manual"];

export default function ProspectsPage() {
  const { prospects, loading, filters, setFilters, refetch, deleteProspect } = useProspects({ limit: 200 });
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, search });
  };

  const handleUpdate = (updated: Prospect) => {
    setSelected(updated);
    refetch();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce prospect ?")) return;
    await deleteProspect(id);
    setSelected(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Prospects</h1>
            <p className="text-sm text-slate-500">{prospects.length} résultats</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} /> Nouveau prospect
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </form>

          <select
            value={filters.status ?? ""}
            onChange={(e) => setFilters({ ...filters, status: (e.target.value as ProspectStatus) || undefined })}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          <select
            value={filters.code_naf ?? ""}
            onChange={(e) => setFilters({ ...filters, code_naf: e.target.value || undefined })}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">Tous les secteurs</option>
            {NAF_CODES.map((c) => (
              <option key={c} value={c}>{NAF_LABELS[c] ?? c}</option>
            ))}
          </select>

          <select
            value={filters.source ?? ""}
            onChange={(e) => setFilters({ ...filters, source: (e.target.value as ProspectSource) || undefined })}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">Toutes les sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">ICP min</span>
            <input
              type="number"
              min={0} max={100}
              value={filters.icp_min ?? ""}
              onChange={(e) => setFilters({ ...filters, icp_min: e.target.value ? Number(e.target.value) : undefined })}
              className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Raison sociale", "Localisation", "Secteur", "Tel", "Email", "ICP", "Statut", "Source"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prospects.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 max-w-48">
                      <div className="font-medium text-slate-900 truncate">{p.raison_sociale}</div>
                      {p.nom_commercial && <div className="text-xs text-slate-400 truncate">{p.nom_commercial}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{p.code_postal} {p.ville}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{NAF_LABELS[p.code_naf ?? ""] ?? p.code_naf ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{p.tel ?? "—"}</td>
                    <td className="px-4 py-3 text-xs max-w-36">
                      <span className="truncate block text-slate-600">{p.email ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold text-sm ${icpColor(p.icp_score)}`}>{p.icp_score}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{SOURCE_LABELS[p.source]}</td>
                  </tr>
                ))}
                {prospects.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      Aucun prospect trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProspectDrawer
        prospect={selected}
        onClose={() => setSelected(null)}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
