import { useState, useEffect } from "react";
import { Sequence } from "@/api/outreach";
import { supabase, isSupabaseConfigured } from "@/api/supabase";
import { mockApi } from "@/api/mock";

export function useSequences() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const [{ data: seqs }, { data: tpls }] = await Promise.all([
          supabase.from("sequences").select("*").order("created_at", { ascending: false }),
          supabase.from("email_templates").select("*"),
        ]);
        setSequences((seqs ?? []) as Sequence[]);
        setTemplates(tpls ?? []);
      } else {
        setSequences(mockApi.sequences.list() as Sequence[]);
        setTemplates([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const createSequence = async (data: Partial<Sequence>) => {
    if (isSupabaseConfigured) {
      const { data: seq, error } = await supabase.from("sequences").insert(data).select().single();
      if (error) throw new Error(error.message);
      setSequences((prev) => [seq as Sequence, ...prev]);
      return seq as Sequence;
    } else {
      const seq = mockApi.sequences.create(data) as Sequence;
      setSequences((prev) => [seq, ...prev]);
      return seq;
    }
  };

  const deleteSequence = async (id: number) => {
    if (isSupabaseConfigured) await supabase.from("sequences").delete().eq("id", id);
    else mockApi.sequences.delete(id);
    setSequences((prev) => prev.filter((s) => s.id !== id));
  };

  return { sequences, templates, loading, refetch: fetch, createSequence, deleteSequence };
}
