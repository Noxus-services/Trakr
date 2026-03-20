import { useAuthStore } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/api/supabase";
import { User, Shield, Database, CheckCircle, XCircle } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuthStore();

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
