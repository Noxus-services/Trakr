import { useState, useEffect, useCallback } from "react";
import { Prospect, ProspectFilters, ProspectStatus } from "@/api/prospects";
import { supabase, isSupabaseConfigured } from "@/api/supabase";
import { mockApi } from "@/api/mock";

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbList(filters: ProspectFilters): Promise<Prospect[]> {
  let q = supabase.from("prospects").select("*");
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.source) q = q.eq("source", filters.source);
  if (filters.code_naf) q = q.eq("code_naf", filters.code_naf);
  if (filters.ville) q = q.ilike("ville", `%${filters.ville}%`);
  if (filters.icp_min) q = q.gte("icp_score", filters.icp_min);
  if (filters.assigned_to) q = q.eq("assigned_to", filters.assigned_to);
  if (filters.search) q = q.ilike("raison_sociale", `%${filters.search}%`);
  q = q.order("icp_score", { ascending: false });
  if (filters.limit) q = q.limit(filters.limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Prospect[];
}

async function sbUpdateStatus(id: number, status: ProspectStatus): Promise<Prospect> {
  const { data, error } = await supabase
    .from("prospects")
    .update({ status, last_contacted_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  // Log action
  await supabase.from("prospect_actions").insert({
    prospect_id: id,
    action_type: "status_change",
    description: `Statut → ${status}`,
  });
  return data as Prospect;
}

async function sbDelete(id: number) {
  await supabase.from("prospects").delete().eq("id", id);
}

async function sbPipelineSummary() {
  const { data } = await supabase.from("prospects").select("status");
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => { counts[r.status] = (counts[r.status] ?? 0) + 1; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const contacted = (counts.contacted ?? 0) + (counts.interested ?? 0) + (counts.demo ?? 0) + (counts.won ?? 0);
  return {
    by_status: counts, total,
    contact_rate: total ? Math.round(contacted / total * 1000) / 10 : 0,
    conversion_rate: contacted ? Math.round((counts.won ?? 0) / contacted * 1000) / 10 : 0,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProspects(initialFilters: ProspectFilters = {}) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProspectFilters>(initialFilters);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = isSupabaseConfigured
        ? await sbList(filters)
        : mockApi.prospects.list(filters);
      setProspects(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetch(); }, [fetch]);

  // Realtime subscription (Supabase only)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel("prospects-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "prospects" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const updateStatus = async (id: number, status: ProspectStatus) => {
    const updated = isSupabaseConfigured
      ? await sbUpdateStatus(id, status)
      : mockApi.prospects.updateStatus(id, status);
    setProspects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  };

  const deleteProspect = async (id: number) => {
    if (isSupabaseConfigured) await sbDelete(id);
    else mockApi.prospects.delete(id);
    setProspects((prev) => prev.filter((p) => p.id !== id));
  };

  return { prospects, loading, error, filters, setFilters, refetch: fetch, updateStatus, deleteProspect };
}

export function usePipelineSummary() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const load = isSupabaseConfigured ? sbPipelineSummary() : Promise.resolve(mockApi.prospects.pipelineSummary());
    load.then(setSummary).catch(console.error).finally(() => setLoading(false));
  }, []);

  return { summary, loading };
}
