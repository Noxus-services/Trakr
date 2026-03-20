import { useState } from "react";
import { useSequences } from "@/hooks/useSequences";
import { Sequence, SequenceStep } from "@/api/outreach";
import { Plus, Trash2, Mail, Phone, CheckSquare, ChevronDown, ChevronUp } from "lucide-react";

const STEP_TYPE_ICONS = {
  email: Mail,
  call: Phone,
  task: CheckSquare,
};

const DEFAULT_STEPS: SequenceStep[] = [
  { day: 0, type: "email", template: "intro_nuisibles" },
  { day: 3, type: "email", template: "suivi_1" },
  { day: 7, type: "task", description: "Appel téléphonique" },
  { day: 14, type: "email", template: "derniere_chance" },
];

export default function SequencesPage() {
  const { sequences, templates, loading, createSequence, deleteSequence } = useSequences();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSteps, setNewSteps] = useState<SequenceStep[]>(DEFAULT_STEPS);
  const [expanded, setExpanded] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!newName) return;
    await createSequence({ name: newName, steps: newSteps });
    setNewName("");
    setNewSteps(DEFAULT_STEPS);
    setShowCreate(false);
  };

  const addStep = () => {
    setNewSteps((prev) => [...prev, { day: prev.length * 3, type: "email" }]);
  };

  const updateStep = (i: number, patch: Partial<SequenceStep>) => {
    setNewSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const removeStep = (i: number) => {
    setNewSteps((prev) => prev.filter((_, idx) => idx !== i));
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Séquences email</h1>
          <p className="text-sm text-slate-500">Automatisez vos campagnes d'outreach</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Nouvelle séquence
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-slate-800">Nouvelle séquence</h3>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nom</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ex: Séquence restauration"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-500">Étapes</label>
              <button onClick={addStep} className="text-xs text-blue-600 hover:text-blue-700">
                + Ajouter étape
              </button>
            </div>
            <div className="space-y-2">
              {newSteps.map((step, i) => {
                const Icon = STEP_TYPE_ICONS[step.type] ?? Mail;
                return (
                  <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                    <Icon size={14} className="text-slate-500 shrink-0" />
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <span className="text-xs text-slate-500">Jour</span>
                      <input
                        type="number"
                        value={step.day}
                        onChange={(e) => updateStep(i, { day: Number(e.target.value) })}
                        className="w-14 border border-slate-200 rounded px-2 py-1 text-xs"
                      />
                      <select
                        value={step.type}
                        onChange={(e) => updateStep(i, { type: e.target.value as any })}
                        className="border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                      >
                        <option value="email">Email</option>
                        <option value="task">Tâche</option>
                        <option value="call">Appel</option>
                      </select>
                      {step.type === "email" ? (
                        <input
                          value={step.template ?? ""}
                          onChange={(e) => updateStep(i, { template: e.target.value })}
                          placeholder="Nom du template"
                          className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs"
                        />
                      ) : (
                        <input
                          value={step.description ?? ""}
                          onChange={(e) => updateStep(i, { description: e.target.value })}
                          placeholder="Description de la tâche"
                          className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs"
                        />
                      )}
                    </div>
                    <button onClick={() => removeStep(i)} className="text-slate-300 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg border border-slate-200"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Créer la séquence
            </button>
          </div>
        </div>
      )}

      {/* Sequence list */}
      <div className="space-y-3">
        {sequences.map((seq) => {
          const isExpanded = expanded === seq.id;
          return (
            <div key={seq.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpanded(isExpanded ? null : seq.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${seq.is_active ? "bg-green-500" : "bg-slate-300"}`} />
                  <div>
                    <p className="font-semibold text-slate-800">{seq.name}</p>
                    <p className="text-xs text-slate-400">{seq.steps.length} étape{seq.steps.length > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSequence(seq.id); }}
                    className="p-1.5 text-slate-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                  {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-4 border-t border-slate-100">
                  <div className="mt-3 space-y-2">
                    {seq.steps.map((step: SequenceStep, i: number) => {
                      const Icon = STEP_TYPE_ICONS[step.type] ?? Mail;
                      return (
                        <div key={i} className="flex items-center gap-3 text-sm text-slate-600">
                          <span className="text-xs text-slate-400 w-12 shrink-0">J+{step.day}</span>
                          <Icon size={13} className="text-slate-400" />
                          <span>
                            {step.type === "email" ? (
                              <>Email: <span className="font-medium text-slate-700">{step.template}</span></>
                            ) : (
                              step.description
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sequences.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400">
            Aucune séquence configurée
          </div>
        )}
      </div>
    </div>
  );
}
