import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/api/supabase";
import { mockApi } from "@/api/mock";
import { DashboardMetrics, NafDistribution, WeeklyEvolution, TemplateStats } from "@/api/analytics";
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import { Users, TrendingUp, Mail, MailOpen, MousePointerClick, Target, ArrowUpRight, RefreshCw } from "lucide-react";
import { NAF_LABELS } from "@/lib/utils";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function KpiCard({ title, value, subtitle, icon: Icon, color = "blue" }: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; color?: "blue" | "green" | "amber" | "purple" | "slate";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600", green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600", purple: "bg-purple-50 text-purple-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

async function sbDashboard(): Promise<DashboardMetrics> {
  const { data: prospects } = await supabase.from("prospects").select("status, icp_score, created_at");
  const { data: outreach } = await supabase.from("outreach_logs").select("sent_at, opened_at, clicked_at");

  const all = prospects ?? [];
  const total = all.length;
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const newThisWeek = all.filter((p: any) => p.created_at >= oneWeekAgo).length;
  const contacted = all.filter((p: any) => ["contacted", "interested", "demo", "won"].includes(p.status)).length;
  const won = all.filter((p: any) => p.status === "won").length;
  const avgIcp = total ? Math.round(all.reduce((s: number, p: any) => s + (p.icp_score ?? 0), 0) / total) : 0;

  const logs = outreach ?? [];
  const sent = logs.filter((l: any) => l.sent_at).length;
  const opened = logs.filter((l: any) => l.opened_at).length;
  const clicked = logs.filter((l: any) => l.clicked_at).length;

  const status_counts: Record<string, number> = {};
  all.forEach((p: any) => { status_counts[p.status] = (status_counts[p.status] ?? 0) + 1; });

  return {
    total_prospects: total,
    new_this_week: newThisWeek,
    contact_rate: total ? Math.round(contacted / total * 1000) / 10 : 0,
    conversion_rate: contacted ? Math.round(won / contacted * 1000) / 10 : 0,
    avg_icp_score: avgIcp,
    emails_sent: sent,
    emails_opened: opened,
    emails_clicked: clicked,
    open_rate: sent ? Math.round(opened / sent * 1000) / 10 : 0,
    click_rate: sent ? Math.round(clicked / sent * 1000) / 10 : 0,
    status_counts,
  };
}

async function sbNafDistribution(): Promise<NafDistribution[]> {
  const { data } = await supabase.from("prospects").select("code_naf");
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => {
    if (r.code_naf) counts[r.code_naf] = (counts[r.code_naf] ?? 0) + 1;
  });
  return Object.entries(counts)
    .map(([code_naf, count]) => ({ code_naf, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

async function sbEvolution(): Promise<WeeklyEvolution[]> {
  const { data } = await supabase.from("prospects").select("created_at");
  const weeks: Record<string, number> = {};
  (data ?? []).forEach((r: any) => {
    const d = new Date(r.created_at);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weeks[key] = (weeks[key] ?? 0) + 1;
  });
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([week, count]) => ({ week, count }));
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [nafData, setNafData] = useState<NafDistribution[]>([]);
  const [evolution, setEvolution] = useState<WeeklyEvolution[]>([]);
  const [templateStats] = useState<TemplateStats[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const [m, naf, evo] = await Promise.all([sbDashboard(), sbNafDistribution(), sbEvolution()]);
        setMetrics(m);
        setNafData(naf);
        setEvolution(evo);
      } else {
        setMetrics(mockApi.analytics.dashboard() as DashboardMetrics);
        setNafData(mockApi.analytics.byNaf());
        setEvolution(mockApi.analytics.evolution());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const nafColors = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ef4444"];
  const nafChartData = {
    labels: nafData.map((d) => NAF_LABELS[d.code_naf] ?? d.code_naf),
    datasets: [{ data: nafData.map((d) => d.count), backgroundColor: nafColors, borderWidth: 0 }],
  };
  const evolutionChartData = {
    labels: evolution.map((e) => e.week),
    datasets: [{ label: "Prospects", data: evolution.map((e) => e.count), backgroundColor: "#3b82f6", borderRadius: 6 }],
  };
  const templateChartData = {
    labels: templateStats.map((t) => t.template),
    datasets: [
      { label: "Envoyés", data: templateStats.map((t) => t.sent), backgroundColor: "#cbd5e1", borderRadius: 4 },
      { label: "Ouverts", data: templateStats.map((t) => t.opened), backgroundColor: "#3b82f6", borderRadius: 4 },
    ],
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Vue d'ensemble de la prospection</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs border px-2.5 py-1 rounded-full font-medium ${
            isSupabaseConfigured
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-amber-100 text-amber-700 border-amber-200"
          }`}>
            {isSupabaseConfigured ? "Supabase Live" : "Mode démo — données locales"}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total prospects" value={metrics?.total_prospects ?? 0} subtitle={`+${metrics?.new_this_week ?? 0} cette semaine`} icon={Users} color="blue" />
        <KpiCard title="Taux de contact" value={`${metrics?.contact_rate ?? 0}%`} subtitle="contacté / total" icon={TrendingUp} color="green" />
        <KpiCard title="Taux de conversion" value={`${metrics?.conversion_rate ?? 0}%`} subtitle="gagné / contacté" icon={Target} color="amber" />
        <KpiCard title="Score ICP moyen" value={metrics?.avg_icp_score ?? 0} subtitle="sur 100" icon={ArrowUpRight} color="purple" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Emails envoyés" value={metrics?.emails_sent ?? 0} icon={Mail} color="slate" />
        <KpiCard title="Taux d'ouverture" value={`${metrics?.open_rate ?? 0}%`} subtitle={`${metrics?.emails_opened ?? 0} ouverts`} icon={MailOpen} color="blue" />
        <KpiCard title="Taux de clic" value={`${metrics?.click_rate ?? 0}%`} subtitle={`${metrics?.emails_clicked ?? 0} clics`} icon={MousePointerClick} color="green" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Prospects par secteur NAF</h3>
          {nafData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-44 h-44 shrink-0">
                <Doughnut data={nafChartData} options={{ cutout: "65%", plugins: { legend: { display: false } } }} />
              </div>
              <div className="flex-1 space-y-2">
                {nafData.slice(0, 5).map((d, i) => (
                  <div key={d.code_naf} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: nafColors[i] }} />
                      <span className="text-xs text-slate-600 truncate max-w-32">{NAF_LABELS[d.code_naf] ?? d.code_naf}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-700">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-12">Aucune donnée</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Évolution pipeline (8 semaines)</h3>
          {evolution.length > 0 ? (
            <Bar data={evolutionChartData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: "#f1f5f9" } } } }} />
          ) : (
            <p className="text-sm text-slate-400 text-center py-12">Aucune donnée</p>
          )}
        </div>

        {templateStats.length > 0 && (
          <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Performance par template email</h3>
            <Bar data={templateChartData} options={{ responsive: true, indexAxis: "y" as const, plugins: { legend: { position: "top" as const } }, scales: { x: { grid: { color: "#f1f5f9" } }, y: { grid: { display: false } } } }} />
          </div>
        )}
      </div>
    </div>
  );
}
