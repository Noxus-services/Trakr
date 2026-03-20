import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_LABELS: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  interested: "Intéressé",
  demo: "Démo planifiée",
  won: "Gagné",
  lost: "Perdu",
};

export const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  interested: "bg-amber-50 text-amber-700 border-amber-200",
  demo: "bg-purple-50 text-purple-700 border-purple-200",
  won: "bg-green-50 text-green-700 border-green-200",
  lost: "bg-red-50 text-red-700 border-red-200",
};

export const SOURCE_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  pages_jaunes: "PagesJaunes",
  sirene: "Sirène INSEE",
  linkedin: "LinkedIn",
  manual: "Manuel",
};

export const NAF_LABELS: Record<string, string> = {
  "5610A": "Restauration rapide",
  "5610C": "Restauration traditionnelle",
  "5630Z": "Débits de boissons",
  "5510Z": "Hôtellerie",
  "4711D": "Supermarchés",
  "1013A": "IAA — Viande",
  "1089Z": "IAA — Autres",
};

export function icpColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-blue-600";
  return "text-slate-400";
}

export function icpBg(score: number): string {
  if (score >= 80) return "bg-green-50 border-green-200";
  if (score >= 60) return "bg-amber-50 border-amber-200";
  if (score >= 40) return "bg-blue-50 border-blue-200";
  return "bg-slate-50 border-slate-200";
}
