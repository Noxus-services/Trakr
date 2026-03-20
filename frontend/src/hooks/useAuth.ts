import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase, isSupabaseConfigured } from "@/api/supabase";

interface User {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      login: async (email: string, password: string) => {
        if (isSupabaseConfigured) {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw new Error(error.message);
          const u = data.user!;
          set({
            token: data.session!.access_token,
            user: {
              id: u.id,
              email: u.email!,
              full_name: u.user_metadata?.full_name ?? email.split("@")[0],
              is_admin: u.user_metadata?.is_admin ?? false,
            },
          });
        } else {
          // Mode démo local
          set({
            token: "demo-" + Date.now(),
            user: {
              id: "demo-user",
              email,
              full_name: email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              is_admin: true,
            },
          });
        }
      },

      logout: async () => {
        if (isSupabaseConfigured) await supabase.auth.signOut();
        set({ token: null, user: null });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
