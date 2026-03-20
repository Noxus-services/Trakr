import { useState } from "react";
import { useProspects, usePipelineSummary } from "@/hooks/useProspects";
import { Prospect, ProspectStatus } from "@/api/prospects";
import KanbanBoard from "@/components/KanbanBoard";
import ProspectDrawer from "@/components/ProspectDrawer";
import { List, KanbanSquare, RefreshCw } from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS, NAF_LABELS, icpColor } from "@/lib/utils";

export default function PipelinePage() {
  const { prospects, loading, updateStatus, refetch } = useProspects({ limit: 500 });
  const { summary } = usePipelineSummary();
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");

  const handleStatusChange = async (id: number, status: ProspectStatus) => {
    await updateStatus(id, status);
  };

  const handleUpdate = (updated: Prospect) => {
    setSelected(updated);
    refetch();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pipeline CRM</h1>
          {summary && (
            <p className="text-sm text-slate-500">
              {summary.total} prospects · {summary.contact_rate}% contactés · {summary.conversion_rate}% convertis
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView("kanban")}
              className={cn("p-2 transition-colors", view === "kanban" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}
            >
              <KanbanSquare size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("p-2 transition-colors", view === "list" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        ) : view === "kanban" ? (
          <KanbanBoard
            prospects={prospects}
            onStatusChange={handleStatusChange}
            onCardClick={setSelected}
          />
        ) : (
          <ListView
            prospects={prospects}
            onRowClick={setSelected}
            onStatusChange={handleStatusChange}
          />
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

function ListView({
  prospects,
  onRowClick,
  onStatusChange,
}: {
  prospects: Prospect[];
  onRowClick: (p: Prospect) => void;
  onStatusChange: (id: number, status: ProspectStatus) => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden h-full overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
          <tr>
            {["Raison sociale", "Ville", "NAF", "ICP", "Statut", "Source", "Email"].map((h) => (
              <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {prospects.map((p) => (
            <tr
              key={p.id}
              onClick={() => onRowClick(p)}
              className="hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-medium text-slate-900 max-w-48 truncate">{p.raison_sociale}</td>
              <td className="px-4 py-3 text-slate-600">{p.ville}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">{p.code_naf ? (NAF_LABELS[p.code_naf] ?? p.code_naf) : "—"}</td>
              <td className="px-4 py-3">
                <span className={`font-bold ${icpColor(p.icp_score)}`}>{p.icp_score}</span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[p.status]}`}>
                  {STATUS_LABELS[p.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{p.source.replace("_", " ")}</td>
              <td className="px-4 py-3 text-xs text-slate-500 truncate max-w-32">{p.email ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
