import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── NAF catalog (main French sectors) ─────────────────────────────────────────
export const NAF_CATALOG: { code: string; label: string; sector: string }[] = [
  // Restauration & Hôtellerie
  { code: "5610A", label: "Restauration rapide", sector: "CHR" },
  { code: "5610C", label: "Restauration traditionnelle", sector: "CHR" },
  { code: "5630Z", label: "Débits de boissons / Bars", sector: "CHR" },
  { code: "5510Z", label: "Hôtellerie", sector: "CHR" },
  { code: "5520Z", label: "Hébergement touristique", sector: "CHR" },
  { code: "5590Z", label: "Autres hébergements", sector: "CHR" },
  // Alimentaire
  { code: "4711D", label: "Supermarchés", sector: "Commerce alimentaire" },
  { code: "4711F", label: "Hypermarchés", sector: "Commerce alimentaire" },
  { code: "4721Z", label: "Boulangeries-pâtisseries", sector: "Commerce alimentaire" },
  { code: "4724Z", label: "Boucheries", sector: "Commerce alimentaire" },
  { code: "4781Z", label: "Marchés alimentaires", sector: "Commerce alimentaire" },
  { code: "1013A", label: "IAA — Viande", sector: "Industrie agroalimentaire" },
  { code: "1013B", label: "IAA — Charcuterie", sector: "Industrie agroalimentaire" },
  { code: "1020Z", label: "IAA — Poisson", sector: "Industrie agroalimentaire" },
  { code: "1089Z", label: "IAA — Autres", sector: "Industrie agroalimentaire" },
  { code: "1101Z", label: "Production de boissons alcooliques", sector: "Industrie agroalimentaire" },
  { code: "1107B", label: "Boissons sans alcool", sector: "Industrie agroalimentaire" },
  // Santé
  { code: "8610Z", label: "Activités hospitalières", sector: "Santé" },
  { code: "8621Z", label: "Médecine générale", sector: "Santé" },
  { code: "8622A", label: "Chirurgie", sector: "Santé" },
  { code: "8623Z", label: "Dentaires", sector: "Santé" },
  { code: "8690A", label: "Ambulances", sector: "Santé" },
  { code: "8690D", label: "Kinésithérapie", sector: "Santé" },
  { code: "8710A", label: "EHPAD", sector: "Santé" },
  { code: "8710B", label: "Maisons de retraite", sector: "Santé" },
  { code: "8720A", label: "Hébergement médico-social adultes", sector: "Santé" },
  { code: "8730A", label: "Hébergement personnes âgées", sector: "Santé" },
  // Commerce
  { code: "4511Z", label: "Commerce voitures neuves", sector: "Automobile" },
  { code: "4519Z", label: "Commerce autres véhicules", sector: "Automobile" },
  { code: "4520A", label: "Entretien & réparation auto", sector: "Automobile" },
  { code: "4531Z", label: "Commerce pièces détachées", sector: "Automobile" },
  { code: "4778C", label: "Commerces de détail divers", sector: "Commerce" },
  { code: "4741Z", label: "Informatique / High-tech", sector: "Commerce" },
  { code: "4775Z", label: "Parfumeries / Cosmétiques", sector: "Commerce" },
  // BTP & Immobilier
  { code: "4120A", label: "Construction maisons individuelles", sector: "BTP" },
  { code: "4120B", label: "Construction bâtiments", sector: "BTP" },
  { code: "4211Z", label: "Travaux routiers", sector: "BTP" },
  { code: "4321A", label: "Électricité / Plomberie", sector: "BTP" },
  { code: "4322A", label: "Plomberie / Chauffage", sector: "BTP" },
  { code: "4331Z", label: "Plâtrerie / Isolation", sector: "BTP" },
  { code: "4332A", label: "Menuiserie bois", sector: "BTP" },
  { code: "4339Z", label: "Revêtements sols & murs", sector: "BTP" },
  { code: "4391A", label: "Couverture / Zinguerie", sector: "BTP" },
  { code: "6810Z", label: "Marchands de biens immobiliers", sector: "Immobilier" },
  { code: "6820A", label: "Location immobilier résidentiel", sector: "Immobilier" },
  { code: "6831Z", label: "Agences immobilières", sector: "Immobilier" },
  // Services aux entreprises
  { code: "6920Z", label: "Comptabilité / Expertise comptable", sector: "Services B2B" },
  { code: "6910Z", label: "Activités juridiques", sector: "Services B2B" },
  { code: "7010Z", label: "Direction entreprises", sector: "Services B2B" },
  { code: "7021Z", label: "Conseil en relations publiques", sector: "Services B2B" },
  { code: "7022Z", label: "Conseil en gestion", sector: "Services B2B" },
  { code: "7112B", label: "Ingénierie & études techniques", sector: "Services B2B" },
  { code: "7120B", label: "Analyses & essais techniques", sector: "Services B2B" },
  { code: "7311Z", label: "Agences de publicité", sector: "Services B2B" },
  { code: "7320Z", label: "Études de marché", sector: "Services B2B" },
  { code: "7490B", label: "Activités spécialisées diverses", sector: "Services B2B" },
  { code: "8211Z", label: "Services administratifs", sector: "Services B2B" },
  { code: "8219Z", label: "Photocopie / Secrétariat", sector: "Services B2B" },
  { code: "8291Z", label: "Agences de recouvrement", sector: "Services B2B" },
  // Tech & Numérique
  { code: "6201Z", label: "Programmation informatique", sector: "Tech" },
  { code: "6202A", label: "Conseil en systèmes informatiques", sector: "Tech" },
  { code: "6311Z", label: "Traitement de données / Hébergement", sector: "Tech" },
  { code: "6312Z", label: "Portails internet", sector: "Tech" },
  { code: "6399Z", label: "Autres services d'information", sector: "Tech" },
  { code: "6209Z", label: "Autres activités informatiques", sector: "Tech" },
  // Transport & Logistique
  { code: "4941A", label: "Transports routiers marchandises", sector: "Transport" },
  { code: "4941B", label: "Transports frigorifiques", sector: "Transport" },
  { code: "4942Z", label: "Déménagement", sector: "Transport" },
  { code: "5210B", label: "Entreposage / Stockage", sector: "Transport" },
  { code: "5320Z", label: "Autres activités de courrier", sector: "Transport" },
  // Éducation
  { code: "8510Z", label: "Enseignement pré-primaire", sector: "Éducation" },
  { code: "8520Z", label: "Enseignement primaire", sector: "Éducation" },
  { code: "8531Z", label: "Enseignement secondaire", sector: "Éducation" },
  { code: "8532Z", label: "Enseignement technique", sector: "Éducation" },
  { code: "8552Z", label: "Enseignement culturel", sector: "Éducation" },
  { code: "8559A", label: "Formation continue", sector: "Éducation" },
  { code: "8559B", label: "Formation professionnelle", sector: "Éducation" },
];

// ── Types ──────────────────────────────────────────────────────────────────────
export interface WorkspaceConfig {
  id: string;
  name: string;
  color: string;
  naf_codes: string[]; // list of codes
  icp_effectif_min: number;
  icp_effectif_max: number;
  icp_require_tel: boolean;
  icp_require_email: boolean;
  icp_require_site: boolean;
  notes: string;
  created_at: string;
}

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

function newWorkspace(name: string, colorIdx = 0): WorkspaceConfig {
  return {
    id: crypto.randomUUID(),
    name,
    color: COLORS[colorIdx % COLORS.length],
    naf_codes: ["5610A", "5610C", "5630Z", "5510Z"],
    icp_effectif_min: 1,
    icp_effectif_max: 500,
    icp_require_tel: false,
    icp_require_email: false,
    icp_require_site: false,
    notes: "",
    created_at: new Date().toISOString(),
  };
}

// ── Store ──────────────────────────────────────────────────────────────────────
interface WorkspaceStore {
  workspaces: WorkspaceConfig[];
  activeId: string;

  // Computed
  active: () => WorkspaceConfig;
  activeNafOptions: () => { code: string; label: string }[];

  // Actions
  setActive: (id: string) => void;
  create: (name: string) => void;
  update: (id: string, patch: Partial<WorkspaceConfig>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
}

const DEFAULT = newWorkspace("Société principale", 0);

export const useWorkspace = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [DEFAULT],
      activeId: DEFAULT.id,

      active: () => {
        const { workspaces, activeId } = get();
        return workspaces.find((w) => w.id === activeId) ?? workspaces[0];
      },

      activeNafOptions: () => {
        const active = get().active();
        return NAF_CATALOG.filter((n) => active.naf_codes.includes(n.code)).map((n) => ({
          code: n.code,
          label: `${n.code} — ${n.label}`,
        }));
      },

      setActive: (id) => set({ activeId: id }),

      create: (name) => {
        const { workspaces } = get();
        const ws = newWorkspace(name, workspaces.length);
        set({ workspaces: [...workspaces, ws], activeId: ws.id });
      },

      update: (id, patch) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        })),

      remove: (id) =>
        set((s) => {
          const filtered = s.workspaces.filter((w) => w.id !== id);
          if (filtered.length === 0) {
            const def = newWorkspace("Société principale");
            return { workspaces: [def], activeId: def.id };
          }
          return {
            workspaces: filtered,
            activeId: s.activeId === id ? filtered[0].id : s.activeId,
          };
        }),

      duplicate: (id) =>
        set((s) => {
          const src = s.workspaces.find((w) => w.id === id);
          if (!src) return s;
          const copy: WorkspaceConfig = {
            ...src,
            id: crypto.randomUUID(),
            name: `${src.name} (copie)`,
            color: COLORS[(s.workspaces.length) % COLORS.length],
            created_at: new Date().toISOString(),
          };
          return { workspaces: [...s.workspaces, copy], activeId: copy.id };
        }),
    }),
    { name: "trakr_workspaces" }
  )
);
