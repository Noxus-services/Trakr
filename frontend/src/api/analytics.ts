import { api } from "./client";

export interface DashboardMetrics {
  total_prospects: number;
  new_this_week: number;
  contact_rate: number;
  conversion_rate: number;
  avg_icp_score: number;
  emails_sent: number;
  emails_opened: number;
  emails_clicked: number;
  open_rate: number;
  click_rate: number;
  status_counts: Record<string, number>;
}

export interface NafDistribution {
  code_naf: string;
  count: number;
}

export interface WeeklyEvolution {
  week: string;
  count: number;
}

export interface TemplateStats {
  template: string;
  sent: number;
  opened: number;
  clicked: number;
  open_rate: number;
}

export const analyticsApi = {
  dashboard: () => api.get<DashboardMetrics>("/analytics/dashboard"),
  byNaf: () => api.get<NafDistribution[]>("/analytics/prospects-by-naf"),
  evolution: (weeks?: number) =>
    api.get<WeeklyEvolution[]>(`/analytics/pipeline-evolution${weeks ? `?weeks=${weeks}` : ""}`),
  emailByTemplate: () => api.get<TemplateStats[]>("/analytics/email-by-template"),
  geoDistribution: () => api.get<{ code_postal: string; ville: string; count: number }[]>("/analytics/geo-distribution"),
};
