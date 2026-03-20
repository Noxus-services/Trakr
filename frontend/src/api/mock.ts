/**
 * Données de démonstration — utilisées quand le backend n'est pas disponible.
 * Stockées dans localStorage pour persister entre les sessions.
 */

import { Prospect, ProspectStatus, ProspectSource } from "./prospects";

const STORAGE_KEY = "trakr_demo_prospects";
const ACTIONS_KEY = "trakr_demo_actions";

const SAMPLE_PROSPECTS: Omit<Prospect, "created_at" | "updated_at">[] = [
  {
    id: 1, raison_sociale: "Le Petit Bistrot", ville: "Lyon", code_postal: "69001",
    adresse: "12 Rue de la République", code_naf: "5610C", effectif: 15,
    tel: "+33472000001", email: "contact@petitbistrot.fr", email_verified: true,
    unsubscribed: false, site_web: "https://petitbistrot.fr", linkedin_url: undefined,
    icp_score: 85, source: "google_maps" as ProspectSource, status: "new" as ProspectStatus,
    notes: "", tags: ["restauration", "priorité"], google_rating: 4.5,
    siret: "12345678900001", nom_commercial: "Le Petit Bistrot",
    assigned_to: 1, odoo_partner_id: undefined, lat: 45.764, lng: 4.835,
  },
  {
    id: 2, raison_sociale: "Hôtel des Voyageurs", ville: "Marseille", code_postal: "13001",
    adresse: "5 Boulevard Longchamp", code_naf: "5510Z", effectif: 45,
    tel: "+33491000002", email: "reservation@hotelvoyageurs.fr", email_verified: true,
    unsubscribed: false, site_web: "https://hotelvoyageurs.fr", linkedin_url: undefined,
    icp_score: 75, source: "pages_jaunes" as ProspectSource, status: "contacted" as ProspectStatus,
    notes: "RDV téléphonique le 22/03", tags: ["hôtellerie"], google_rating: 4.2,
    siret: "23456789000002", nom_commercial: undefined,
    assigned_to: 1, odoo_partner_id: undefined, lat: 43.296, lng: 5.381,
  },
  {
    id: 3, raison_sociale: "Supermarché FraisMart", ville: "Paris", code_postal: "75011",
    adresse: "88 Rue Oberkampf", code_naf: "4711D", effectif: 120,
    tel: "+33143000003", email: undefined, email_verified: false,
    unsubscribed: false, site_web: undefined, linkedin_url: undefined,
    icp_score: 60, source: "sirene" as ProspectSource, status: "new" as ProspectStatus,
    notes: "", tags: ["grande-surface"],
    siret: "34567890000003", nom_commercial: "FraisMart Oberkampf",
    assigned_to: 1, odoo_partner_id: undefined, lat: 48.865, lng: 2.375, google_rating: undefined,
  },
  {
    id: 4, raison_sociale: "Brasserie Le Central", ville: "Bordeaux", code_postal: "33000",
    adresse: "1 Place de la Victoire", code_naf: "5630Z", effectif: 22,
    tel: "+33556000004", email: "central@lecentral.fr", email_verified: true,
    unsubscribed: false, site_web: "https://lecentral-bordeaux.fr", linkedin_url: undefined,
    icp_score: 90, source: "google_maps" as ProspectSource, status: "interested" as ProspectStatus,
    notes: "Très intéressé, devis demandé", tags: ["restauration", "brasserie"], google_rating: 4.7,
    siret: "45678901000004", nom_commercial: undefined,
    assigned_to: 1, odoo_partner_id: undefined, lat: 44.836, lng: -0.580,
  },
  {
    id: 5, raison_sociale: "IAA Viandes du Sud", ville: "Toulouse", code_postal: "31000",
    adresse: "Zone Industrielle Sud, Bat. C", code_naf: "1013A", effectif: 85,
    tel: "+33561000005", email: "contact@viandesdusud.fr", email_verified: false,
    unsubscribed: false, site_web: "https://viandesdusud.fr", linkedin_url: undefined,
    icp_score: 70, source: "sirene" as ProspectSource, status: "demo" as ProspectStatus,
    notes: "Démo planifiée le 25/03 à 14h", tags: ["IAA", "viande"],
    siret: "56789012000005", nom_commercial: undefined,
    assigned_to: 1, odoo_partner_id: undefined, lat: 43.604, lng: 1.444, google_rating: undefined,
  },
  {
    id: 6, raison_sociale: "Hôtel Côte d'Azur Palace", ville: "Nice", code_postal: "06000",
    adresse: "32 Promenade des Anglais", code_naf: "5510Z", effectif: 200,
    tel: "+33493000006", email: "direction@cdapalace.fr", email_verified: true,
    unsubscribed: false, site_web: "https://cdapalace.fr", linkedin_url: undefined,
    icp_score: 95, source: "pages_jaunes" as ProspectSource, status: "won" as ProspectStatus,
    notes: "Contrat signé 3 ans", tags: ["hôtellerie", "luxe"], google_rating: 4.9,
    siret: "67890123000006", nom_commercial: "CDA Palace",
    assigned_to: 1, odoo_partner_id: 42, lat: 43.695, lng: 7.266,
  },
  {
    id: 7, raison_sociale: "Fast Burger Express", ville: "Nantes", code_postal: "44000",
    adresse: "14 Rue du Calvaire", code_naf: "5610A", effectif: 8,
    tel: "+33240000007", email: undefined, email_verified: false,
    unsubscribed: false, site_web: undefined, linkedin_url: undefined,
    icp_score: 45, source: "google_maps" as ProspectSource, status: "lost" as ProspectStatus,
    notes: "Pas intéressé pour l'instant", tags: ["fast-food"], google_rating: 3.1,
    siret: "78901234000007", nom_commercial: undefined,
    assigned_to: 1, odoo_partner_id: undefined, lat: 47.218, lng: -1.553,
  },
  {
    id: 8, raison_sociale: "Restaurant La Belle Époque", ville: "Strasbourg", code_postal: "67000",
    adresse: "3 Place Gutenberg", code_naf: "5610C", effectif: 30,
    tel: "+33388000008", email: "info@labelleepoque.fr", email_verified: true,
    unsubscribed: false, site_web: "https://labelleepoque.fr", linkedin_url: undefined,
    icp_score: 80, source: "manual" as ProspectSource, status: "contacted" as ProspectStatus,
    notes: "Référence d'un client existant", tags: ["restauration", "référence"], google_rating: 4.6,
    siret: "89012345000008", nom_commercial: undefined,
    assigned_to: 1, odoo_partner_id: undefined, lat: 48.584, lng: 7.750,
  },
];

function now(): string {
  return new Date().toISOString();
}

function loadProspects(): Prospect[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Init with samples
  const withDates = SAMPLE_PROSPECTS.map((p) => ({
    ...p,
    created_at: now(),
    updated_at: now(),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(withDates));
  return withDates;
}

function saveProspects(prospects: Prospect[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prospects));
}

function loadActions(): Record<number, any[]> {
  try {
    const raw = localStorage.getItem(ACTIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveActions(actions: Record<number, any[]>) {
  localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions));
}

let _nextId = 100;

// ── Mock API ──────────────────────────────────────────────────────────────────

export const mockApi = {
  prospects: {
    list: (filters: any = {}): Prospect[] => {
      let data = loadProspects();
      if (filters.status) data = data.filter((p) => p.status === filters.status);
      if (filters.source) data = data.filter((p) => p.source === filters.source);
      if (filters.code_naf) data = data.filter((p) => p.code_naf === filters.code_naf);
      if (filters.ville) data = data.filter((p) => p.ville?.toLowerCase().includes(filters.ville.toLowerCase()));
      if (filters.icp_min) data = data.filter((p) => p.icp_score >= filters.icp_min);
      if (filters.search) data = data.filter((p) => p.raison_sociale.toLowerCase().includes(filters.search.toLowerCase()));
      return data.sort((a, b) => b.icp_score - a.icp_score);
    },

    get: (id: number): Prospect | null => {
      return loadProspects().find((p) => p.id === id) ?? null;
    },

    create: (data: any): Prospect => {
      const prospects = loadProspects();
      const p: Prospect = {
        ...data,
        id: ++_nextId,
        email_verified: false,
        unsubscribed: false,
        icp_score: computeIcpScore(data),
        status: "new",
        source: data.source ?? "manual",
        created_at: now(),
        updated_at: now(),
      };
      prospects.push(p);
      saveProspects(prospects);
      return p;
    },

    update: (id: number, data: any): Prospect => {
      const prospects = loadProspects();
      const idx = prospects.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error("Not found");
      prospects[idx] = { ...prospects[idx], ...data, updated_at: now() };
      saveProspects(prospects);
      return prospects[idx];
    },

    updateStatus: (id: number, status: ProspectStatus): Prospect => {
      const p = mockApi.prospects.update(id, { status, last_contacted_at: now() });
      // Log action
      const actions = loadActions();
      if (!actions[id]) actions[id] = [];
      actions[id].unshift({
        id: Date.now(), action_type: "status_change",
        description: `Statut changé → ${status}`,
        user_id: 1, created_at: now(),
      });
      saveActions(actions);
      return p;
    },

    delete: (id: number) => {
      const prospects = loadProspects().filter((p) => p.id !== id);
      saveProspects(prospects);
    },

    getActions: (id: number) => {
      const actions = loadActions();
      return actions[id] ?? [];
    },

    addAction: (id: number, data: any) => {
      const actions = loadActions();
      if (!actions[id]) actions[id] = [];
      const action = { id: Date.now(), ...data, user_id: 1, created_at: now() };
      actions[id].unshift(action);
      saveActions(actions);
      return action;
    },

    pipelineSummary: () => {
      const prospects = loadProspects();
      const by_status: Record<string, number> = {};
      prospects.forEach((p) => { by_status[p.status] = (by_status[p.status] ?? 0) + 1; });
      const total = prospects.length;
      const contacted = (by_status.contacted ?? 0) + (by_status.interested ?? 0) + (by_status.demo ?? 0) + (by_status.won ?? 0);
      return {
        by_status,
        total,
        contact_rate: total ? Math.round(contacted / total * 1000) / 10 : 0,
        conversion_rate: contacted ? Math.round((by_status.won ?? 0) / contacted * 1000) / 10 : 0,
      };
    },
  },

  analytics: {
    dashboard: () => {
      const summary = mockApi.prospects.pipelineSummary();
      return {
        total_prospects: summary.total,
        new_this_week: 3,
        contact_rate: summary.contact_rate,
        conversion_rate: summary.conversion_rate,
        avg_icp_score: 74,
        emails_sent: 42,
        emails_opened: 28,
        emails_clicked: 12,
        open_rate: 66.7,
        click_rate: 28.6,
        status_counts: summary.by_status,
      };
    },
    byNaf: () => [
      { code_naf: "5610C", count: 3 },
      { code_naf: "5510Z", count: 2 },
      { code_naf: "5610A", count: 2 },
      { code_naf: "4711D", count: 1 },
      { code_naf: "1013A", count: 1 },
    ],
    evolution: () => [
      { week: "S08 2026", count: 5 },
      { week: "S09 2026", count: 8 },
      { week: "S10 2026", count: 12 },
      { week: "S11 2026", count: 7 },
      { week: "S12 2026", count: 15 },
      { week: "S13 2026", count: 11 },
      { week: "S14 2026", count: 9 },
      { week: "S15 2026", count: 14 },
    ],
    emailByTemplate: () => [
      { template: "intro_nuisibles", sent: 20, opened: 14, clicked: 6, open_rate: 70 },
      { template: "suivi_1", sent: 15, opened: 9, clicked: 4, open_rate: 60 },
      { template: "derniere_chance", sent: 7, opened: 5, clicked: 2, open_rate: 71 },
    ],
  },

  sequences: {
    list: () => [
      {
        id: 1, name: "Séquence Restauration", trigger_status: "new", is_active: true,
        created_at: now(),
        steps: [
          { day: 0, type: "email", template: "intro_nuisibles" },
          { day: 3, type: "email", template: "suivi_1" },
          { day: 7, type: "task", description: "Appel téléphonique" },
          { day: 14, type: "email", template: "derniere_chance" },
        ],
      },
      {
        id: 2, name: "Séquence Hôtellerie", trigger_status: "new", is_active: true,
        created_at: now(),
        steps: [
          { day: 0, type: "email", template: "intro_nuisibles" },
          { day: 5, type: "call", description: "Appel de présentation" },
          { day: 10, type: "email", template: "suivi_1" },
        ],
      },
    ],
    create: (data: any) => ({ id: Date.now(), ...data, is_active: true, created_at: now() }),
    delete: (_id: number) => {},
  },
};

function computeIcpScore(data: any): number {
  const TARGET_NAF = new Set(["5610A", "5610C", "5630Z", "5510Z", "4711D", "1013A", "1089Z"]);
  let score = 0;
  if (data.code_naf && TARGET_NAF.has(data.code_naf)) score += 30;
  if (data.effectif && data.effectif >= 10 && data.effectif <= 200) score += 20;
  if (data.tel) score += 20;
  if (data.email) score += 15;
  return Math.min(score, 100);
}

export const DEMO_MODE = true;
