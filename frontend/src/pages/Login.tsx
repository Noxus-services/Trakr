import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/api/supabase";
import { Bug, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
            <Bug size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Trakr Prospector</h1>
          <p className="text-slate-400 text-sm mt-1">Outil de prospection B2B</p>
        </div>

        {/* Mode badge */}
        {!isSupabaseConfigured && (
          <div className="text-center mb-4">
            <span className="text-xs bg-amber-900/50 border border-amber-700 text-amber-400 px-3 py-1.5 rounded-full">
              Mode démo — entrez n'importe quel email/mot de passe
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="vous@exemple.fr"
              className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        {isSupabaseConfigured && (
          <p className="text-center text-xs text-slate-500 mt-4">
            Pas encore de compte ?{" "}
            <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium">
              Créer un compte
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
