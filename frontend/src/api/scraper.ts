import { api } from "./client";

export interface TaskResponse {
  task_id: string;
  message: string;
}

export interface TaskStatus {
  task_id: string;
  status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE" | "RETRY";
  result?: { scraped: number; saved: number };
}

export const scraperApi = {
  googleMaps: (keyword: string, city: string, radius_km: number) =>
    api.post<TaskResponse>("/scraper/google-maps", { keyword, city, radius_km }),

  pagesJaunes: (quoi: string, ou: string, max_pages: number = 10) =>
    api.post<TaskResponse>("/scraper/pages-jaunes", { quoi, ou, max_pages }),

  sirene: (code_naf: string, code_postal?: string, departement?: string) =>
    api.post<TaskResponse>("/scraper/sirene", { code_naf, code_postal, departement }),

  importLinkedIn: (file: File): Promise<{ imported: number; skipped: number }> => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm("/scraper/linkedin/import", form);
  },

  taskStatus: (taskId: string) =>
    api.get<TaskStatus>(`/scraper/task/${taskId}`),
};
