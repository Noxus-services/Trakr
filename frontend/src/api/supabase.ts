import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 10;

// Only create a real client when credentials are available; otherwise use a dummy URL
// to avoid "supabaseUrl is required" crash in demo mode.
export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL : "https://placeholder.supabase.co",
  isSupabaseConfigured ? SUPABASE_ANON_KEY : "placeholder-key"
);
