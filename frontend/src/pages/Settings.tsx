import { useState, useEffect } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/api/supabase";
import { User, Shield, Database, CheckCircle, XCircle, Server, Eye, EyeOff } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem("trakr_backend_url") || "");
  const [scraperKey, setScraperKey] = useState(() => localStorage.getItem("trakr_scraper_key") || "");
  const [showKey, setShowKey] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"idle" | "ok" | "error">("idle");
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Paramètres</h1>

      {/* Profile */}
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

      {/* API Keys info */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Shield size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Clés API configurées</h2>
        </div>
        <div className="p-5 space-y-3">
          {[
            { label: "Google Places API", env: "GOOGLE_PLACES_API_KEY" },
            { label: "INSEE Sirène", env: "INSEE_API_KEY" },
            { label: "Hunter.io", env: "HUNTER_API_KEY" },
            { label: "Dropcontact", env: "DROPCONTACT_API_KEY" },
            { label: "SendGrid", env: "SENDGRID_API_KEY" },
            { label: "Odoo", env: "ODOO_URL" },
            { label: "Mapbox", env: "MAPBOX_TOKEN" },
          ].map((item) => (
            <div key={item.env} className="flex items-center justify-between">
              <span className="text-sm text-slate-600">{item.label}</span>
              <code className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">{item.env}</code>
            </div>
          ))}
          <p className="text-xs text-slate-400 mt-4">
            Configurez ces variables dans le fichier <code className="bg-slate-100 px-1 rounded">.env</code> du backend.
          </p>
        </div>
      </section>

      {/* Supabase Status */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Database size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Base de données Supabase</h2>
        </div>
        <div className="p-5 space-y-3">
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
                    Pour activer Supabase, ajoutez <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_URL</code> et{" "}
                    <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> dans les variables d'environnement Vercel.
                  </p>
                </div>
              </>
            )}
          </div>
          {!isSupabaseConfigured && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs space-y-2">
              <p className="font-semibold text-slate-700">Configuration Supabase :</p>
              <ol className="list-decimal ml-4 space-y-1 text-slate-600">
                <li>Créez un projet sur <strong>supabase.com</strong></li>
                <li>Exécutez le SQL dans <code>supabase/migrations/001_initial.sql</code></li>
                <li>Copiez l'URL et la clé anon depuis les paramètres du projet</li>
                <li>Dans Vercel → Settings → Environment Variables, ajoutez :<br/>
                  <code className="text-blue-700">VITE_SUPABASE_URL</code> et <code className="text-blue-700">VITE_SUPABASE_ANON_KEY</code>
                </li>
                <li>Redéployez l'application</li>
              </ol>
            </div>
          )}
        </div>
      </section>


      {/* Backend Playwright */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Server size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Backend Playwright</h2>
          <span className="ml-auto text-xs text-slate-400">Google Maps · PagesJaunes</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Le scraping Google Maps et PagesJaunes utilise un serveur Python (FastAPI + Playwright).<br/>
            Déployez le backend sur <strong>Railway</strong> ou <strong>Render</strong> (gratuit) et collez son URL ici.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">URL du backend</label>
            <div className="flex gap-2">
              <input
                value={backendUrl}
                onChange={e => { setBackendUrl(e.target.value); setBackendStatus("idle"); }}
                placeholder="https://trakr-backend.railway.app"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={testBackend}
                className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap">
                Tester
              </button>
            </div>
            {backendStatus === "ok" && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle size={12}/> Backend en ligne</p>
            )}
            {backendStatus === "error" && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><XCircle size={12}/> Connexion échouée</p>
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
                {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </div>

          <button onClick={saveBackend}
            className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            {saved ? "✓ Enregistré" : "Enregistrer"}
          </button>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs space-y-1 text-slate-600">
            <p className="font-semibold text-slate-700">Déploiement rapide sur Railway :</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Allez sur <strong>railway.app</strong> → Deploy from GitHub → repo Trakr → dossier <code>backend/</code></li>
              <li>Ajoutez la variable <code>SCRAPER_API_KEY=votre-secret</code> (optionnel)</li>
              <li>Railway génère une URL → collez-la ci-dessus</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Pipeline config */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Database size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-700 text-sm">Codes NAF ciblés</h2>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {[
              ["5610A", "Restauration rapide"],
              ["5610C", "Restauration traditionnelle"],
              ["5630Z", "Débits de boissons"],
              ["5510Z", "Hôtellerie"],
              ["4711D", "Supermarchés"],
              ["1013A", "IAA Viande"],
              ["1089Z", "IAA Autres"],
            ].map(([code, label]) => (
              <div key={code} className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200">
                <span className="font-mono font-bold">{code}</span>
                <span className="text-blue-500">—</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
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
