import ScraperForm from "@/components/ScraperForm";
import { Zap } from "lucide-react";

export default function ScraperPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <Zap size={20} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Collecte de prospects</h1>
          <p className="text-sm text-slate-500">
            Scrapez Google Maps, PagesJaunes, Sirène ou importez depuis LinkedIn
          </p>
        </div>
      </div>

      <ScraperForm />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Note :</strong> Les tâches de scraping s'exécutent en arrière-plan via Celery.
        Les prospects collectés sont automatiquement dédupliqués et scorés.
        Consultez le <a className="underline font-medium" href="/pipeline">pipeline</a> pour voir les résultats.
      </div>
    </div>
  );
}
