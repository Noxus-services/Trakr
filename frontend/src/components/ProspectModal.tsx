import { useState } from "react";
import { Prospect, ProspectSource } from "@/api/prospects";
import { mockApi } from "@/api/mock";
import { supabase, isSupabaseConfigured } from "@/api/supabase";
import { X, Save } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Prospect) => void;
}

const NAF_OPTIONS = [
  { code: "", label: "— Choisir un secteur —" },
  { code: "5610A", label: "5610A — Restauration rapide" },
  { code: "5610C", label: "5610C — Restauration traditionnelle" },
  { code: "5630Z", label: "5630Z — Débits de boissons" },
  { code: "5510Z", label: "5510Z — Hôtellerie" },
  { code: "4711D", label: "4711D — Supermarchés" },
  { code: "1013A", label: "1013A — IAA Viande" },
  { code: "1089Z", label: "1089Z — IAA Autres" },
];

const SOURCES: { value: ProspectSource; label: string }[] = [
  { value: "manual", label: "Manuel" },
  { value: "google_maps", label: "Google Maps" },
  { value: "pages_jaunes", label: "PagesJaunes" },
  { value: "sirene", label: "Sirène INSEE" },
  { value: "linkedin", label: "LinkedIn" },
];

export default function ProspectModal({ open, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    raison_sociale: "",
    nom_commercial: "",
    adresse: "",
    code_postal: "",
    ville: "",
    tel: "",
    email: "",
    site_web: "",
    siret: "",
    code_naf: "",
    effectif: "",
    contact_prenom: "",
    contact_nom: "",
    contact_titre: "",
    source: "manual" as ProspectSource,
    notes: "",
  });

  if (!open) return null;

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.raison_sociale.trim()) { setError("La raison sociale est obligatoire."); return; }
    setLoading(true);
    setError(null);
    try {
      const data: any = {
        ...form,
        effectif: form.effectif ? Number(form.effectif) : undefined,
        nom_commercial: form.nom_commercial || undefined,
        adresse: form.adresse || undefined,
        code_postal: form.code_postal || undefined,
        ville: form.ville || undefined,
        tel: form.tel || undefined,
        email: form.email || undefined,
        site_web: form.site_web || undefined,
        siret: form.siret || undefined,
        code_naf: form.code_naf || undefined,
        contact_prenom: form.contact_prenom || undefined,
        contact_nom: form.contact_nom || undefined,
        contact_titre: form.contact_titre || undefined,
        notes: form.notes || undefined,
      };

      let created: Prospect;
      if (isSupabaseConfigured) {
        // Compute ICP score
        let icp = 0;
        if (data.code_naf) icp += 30;
        const eff = data.effectif ?? 0;
        if (eff >= 10 && eff <= 200) icp += 20;
        if (data.tel) icp += 20;
        if (data.email) icp += 15;
        if (data.siret) icp += 15;
        const { data: row, error: err } = await supabase.from("prospects")
          .insert({ ...data, icp_score: Math.min(icp, 100), status: "new", email_verified: false, unsubscribed: false })
          .select().single();
        if (err) throw new Error(err.message);
        created = row as Prospect;
      } else {
        created = mockApi.prospects.create(data);
      }

      onCreated(created);
      onClose();
      setForm({ raison_sociale: "", nom_commercial: "", adresse: "", code_postal: "", ville: "",
        tel: "", email: "", site_web: "", siret: "", code_naf: "", effectif: "",
        contact_prenom: "", contact_nom: "", contact_titre: "", source: "manual", notes: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-slate-900">Nouveau prospect</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Entreprise */}
          <Section title="Entreprise">
            <Row2>
              <Field label="Raison sociale *" value={form.raison_sociale} onChange={v => set("raison_sociale", v)} placeholder="SAS Mon Restaurant" required />
              <Field label="Nom commercial" value={form.nom_commercial} onChange={v => set("nom_commercial", v)} placeholder="Mon Resto" />
            </Row2>
            <Row2>
              <Field label="SIRET" value={form.siret} onChange={v => set("siret", v)} placeholder="12345678900000" />
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Code NAF</label>
                <select value={form.code_naf} onChange={e => set("code_naf", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  {NAF_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
              </div>
            </Row2>
            <Row2>
              <Field label="Effectif" value={form.effectif} onChange={v => set("effectif", v)} placeholder="ex: 20" type="number" />
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
                <select value={form.source} onChange={e => set("source", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </Row2>
          </Section>

          {/* Adresse */}
          <Section title="Adresse">
            <Field label="Adresse" value={form.adresse} onChange={v => set("adresse", v)} placeholder="12 Rue de la Paix" />
            <Row2>
              <Field label="Code postal" value={form.code_postal} onChange={v => set("code_postal", v)} placeholder="75001" />
              <Field label="Ville" value={form.ville} onChange={v => set("ville", v)} placeholder="Paris" />
            </Row2>
          </Section>

          {/* Contact */}
          <Section title="Coordonnées">
            <Row2>
              <Field label="Téléphone" value={form.tel} onChange={v => set("tel", v)} placeholder="+33 1 23 45 67 89" type="tel" />
              <Field label="Email" value={form.email} onChange={v => set("email", v)} placeholder="contact@entreprise.fr" type="email" />
            </Row2>
            <Field label="Site web" value={form.site_web} onChange={v => set("site_web", v)} placeholder="https://www.monentreprise.fr" />
          </Section>

          {/* Contact personne */}
          <Section title="Contact principal">
            <Row2>
              <Field label="Prénom" value={form.contact_prenom} onChange={v => set("contact_prenom", v)} placeholder="Jean" />
              <Field label="Nom" value={form.contact_nom} onChange={v => set("contact_nom", v)} placeholder="Dupont" />
            </Row2>
            <Field label="Titre / Fonction" value={form.contact_titre} onChange={v => set("contact_titre", v)} placeholder="Directeur, Gérant, DRH…" />
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              rows={3} placeholder="Informations complémentaires, contexte de la prospection…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Section>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
              {loading ? "Enregistrement…" : "Créer le prospect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, value, onChange, placeholder, required, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}
