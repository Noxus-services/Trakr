import { api } from "./client";

export interface Sequence {
  id: number;
  name: string;
  trigger_status?: string;
  steps: SequenceStep[];
  is_active: boolean;
  created_at: string;
}

export interface SequenceStep {
  day: number;
  type: "email" | "task" | "call";
  template?: string;
  description?: string;
}

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
}

export interface OutreachLog {
  id: number;
  prospect_id: number;
  sequence_id?: number;
  step_index?: number;
  type: string;
  template_name?: string;
  sent_at?: string;
  opened_at?: string;
  clicked_at?: string;
  replied_at?: string;
  unsubscribed_at?: string;
}

export const outreachApi = {
  sequences: {
    list: () => api.get<Sequence[]>("/outreach/sequences"),
    create: (data: Partial<Sequence>) => api.post<Sequence>("/outreach/sequences", data),
    update: (id: number, data: Partial<Sequence>) =>
      api.patch<Sequence>(`/outreach/sequences/${id}`, data),
    delete: (id: number) => api.delete<void>(`/outreach/sequences/${id}`),
  },
  templates: {
    list: () => api.get<EmailTemplate[]>("/outreach/templates"),
    create: (data: Partial<EmailTemplate>) =>
      api.post<EmailTemplate>("/outreach/templates", data),
  },
  enroll: (prospectId: number, sequenceId: number) =>
    api.post(`/outreach/prospects/${prospectId}/enroll`, { sequence_id: sequenceId }),
  logs: (prospectId: number) =>
    api.get<OutreachLog[]>(`/outreach/prospects/${prospectId}/logs`),
};
