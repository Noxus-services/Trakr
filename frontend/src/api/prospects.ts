import { api } from "./client";

export type ProspectStatus = "new" | "contacted" | "interested" | "demo" | "won" | "lost";
export type ProspectSource = "google_maps" | "pages_jaunes" | "sirene" | "linkedin" | "manual";

export interface Prospect {
  id: number;
  siret?: string;
  raison_sociale: string;
  nom_commercial?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  lat?: number;
  lng?: number;
  tel?: string;
  email?: string;
  email_verified: boolean;
  unsubscribed: boolean;
  site_web?: string;
  linkedin_url?: string;
  code_naf?: string;
  effectif?: number;
  contact_prenom?: string;
  contact_nom?: string;
  contact_titre?: string;
  icp_score: number;
  source: ProspectSource;
  status: ProspectStatus;
  notes?: string;
  tags?: string[];
  last_contacted_at?: string;
  odoo_partner_id?: number;
  google_rating?: number;
  assigned_to?: number;
  created_at: string;
  updated_at: string;
}

export interface ProspectAction {
  id: number;
  action_type: string;
  description?: string;
  scheduled_at?: string;
  user_id?: number;
  created_at: string;
}

export interface PipelineSummary {
  by_status: Record<string, number>;
  total: number;
  contact_rate: number;
  conversion_rate: number;
}

export interface ProspectFilters {
  status?: ProspectStatus;
  source?: ProspectSource;
  code_naf?: string;
  ville?: string;
  icp_min?: number;
  assigned_to?: number;
  search?: string;
  skip?: number;
  limit?: number;
}

function buildQuery(filters: ProspectFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
  });
  const q = params.toString();
  return q ? `?${q}` : "";
}

export const prospectsApi = {
  list: (filters: ProspectFilters = {}) =>
    api.get<Prospect[]>(`/crm/prospects${buildQuery(filters)}`),

  get: (id: number) => api.get<Prospect>(`/crm/prospects/${id}`),

  create: (data: Partial<Prospect>) => api.post<Prospect>("/crm/prospects", data),

  update: (id: number, data: Partial<Prospect>) =>
    api.patch<Prospect>(`/crm/prospects/${id}`, data),

  updateStatus: (id: number, status: ProspectStatus) =>
    api.patch<Prospect>(`/crm/prospects/${id}/status`, { status }),

  delete: (id: number) => api.delete<void>(`/crm/prospects/${id}`),

  enrich: (id: number) => api.post<{ task_id: string }>(`/crm/prospects/${id}/enrich`),

  getActions: (id: number) =>
    api.get<ProspectAction[]>(`/crm/prospects/${id}/actions`),

  addAction: (id: number, data: { action_type: string; description?: string; scheduled_at?: string }) =>
    api.post<ProspectAction>(`/crm/prospects/${id}/actions`, data),

  pipelineSummary: () => api.get<PipelineSummary>("/crm/pipeline/summary"),

  pushToOdoo: (id: number) =>
    api.post<{ odoo_partner_id: number }>(`/odoo/push-prospect/${id}`),
};
