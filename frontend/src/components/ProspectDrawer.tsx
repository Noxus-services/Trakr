import { useEffect, useState } from "react";
import { Prospect, ProspectAction, ProspectStatus } from "@/api/prospects";
import { Sequence } from "@/api/outreach";
import { supabase, isSupabaseConfigured } from "@/api/supabase";
import { mockApi } from "@/api/mock";
import { findContacts, FoundContact } from "@/services/contactFinder";
import {
  X, Phone, Mail, Globe, MapPin, Star, Send,
  CheckCircle, Clock, ExternalLink, Plus, Users, Copy, Loader2
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS, SOURCE_LABELS, NAF_LABELS, icpColor, icpBg } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Props {
  prospect: Prospect | null;
  onClose: () => void;
  onUpdate: (p: Prospect) => void;
}

const STATUSES: ProspectStatus[] = ["new", "contacted", "interested", "demo", "won", "lost"];

async function sbGetActions(prospectId: number): Promise<ProspectAction[]> {
  const { data } = await supabase
    .from("prospect_actions")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ProspectAction[];
}

async function sbAddAction(prospectId: number, action: { action_type: string; description: string }): Promise<ProspectAction> {
  const { data } = await supabase
    .from("prospect_actions")
    .insert({ prospect_id: prospectId, ...action })
    .select()
    .single();
  return data as ProspectAction;
}

async function sbUpdateProspect(id: number, updates: Partial<Prospect>): Promise<Prospect> {
  const { data, error } = await supabase
    .from("prospects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Prospect;
}

async function sbUpdateStatus(id: number, status: ProspectStatus): Promise<Prospect> {
  const { data, error } = await supabase
    .from("prospects")
    .update({ status, last_contacted_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("prospect_actions").insert({
    prospect_id: id,
    action_type: "status_change",
    description: `Statut → ${status}`,
  });
  return data as Prospect;
}

async function sbGetSequences(): Promise<Sequence[]> {
  const { data } = await supabase.from("sequences").select("*");
  return (data ?? []) as Sequence[];
}

async function sbEnrollSequence(prospectId: number, sequenceId: number) {
  await supabase.from("sequence_enrollments").insert({
    prospect_id: prospectId,
    sequence_id: sequenceId,
    current_step: 0,
    is_active: true,
  });
}

export default function ProspectDrawer({ prospect, onClose, onUpdate }: Props) {
  const [actions, setActions] = useState<ProspectAction[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [note, setNote] = useState("");
  const [enrollSeqId, setEnrollSeqId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [contacts, setContacts] = useState<FoundContact[]>([]);
  const [findingContacts, setFindingContacts] = useState(false);
  const [contactsCopied, setContactsCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!prospect) return;
    setNote(prospect.notes ?? "");
    setEnrollSeqId(null);
    setContacts([]);

    if (isSupabaseConfigured) {
      sbGetActions(prospect.id).then(setActions).catch(console.error);
      sbGetSequences().then(setSequences).catch(console.error);
    } else {
      setActions(mockApi.prospects.getActions(prospect.id));
      setSequences(mockApi.sequences.list() as Sequence[]);
    }
  }, [prospect]);

  if (!prospect) return null;

  const changeStatus = async (status: ProspectStatus) => {
    try {
      const updated = isSupabaseConfigured
        ? await sbUpdateStatus(prospect.id, status)
        : mockApi.prospects.updateStatus(prospect.id, status);
      onUpdate(updated);
      if (isSupabaseConfigured) {
        sbGetActions(prospect.id).then(setActions).catch(console.error);
      } else {
        setActions(mockApi.prospects.getActions(prospect.id));
      }
    } catch (e: any) {
      console.error(e);
      alert("Erreur: " + e.message);
    }
  };

  const logCall = async () => {
    try {
      if (isSupabaseConfigured) {
        const action = await sbAddAction(prospect.id, {
          action_type: "call",
          description: "Appel téléphonique",
        });
        setActions((prev) => [action, ...prev]);
        if (prospect.status === "new") {
          const updated = await sbUpdateStatus(prospect.id, "contacted");
          onUpdate(updated);
        }
      } else {
        const action = mockApi.prospects.addAction(prospect.id, {
          action_type: "call",
          description: "Appel téléphonique",
        });
        setActions((prev) => [action, ...prev]);
        if (prospect.status === "new") {
          const updated = mockApi.prospects.updateStatus(prospect.id, "contacted");
          onUpdate(updated);
        }
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const saveNote = async () => {
    try {
      const updated = isSupabaseConfigured
        ? await sbUpdateProspect(prospect.id, { notes: note })
        : mockApi.prospects.update(prospect.id, { notes: note });
      onUpdate(updated);
    } catch (e: any) {
      console.error(e);
    }
  };

  const enrich = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    alert("Enrichissement simulé (mode démo) — Connectez le backend FastAPI pour enrichir via Hunter/Dropcontact.");
    setLoading(false);
  };

  const enroll = async () => {
    if (!enrollSeqId) return;
    setEnrolling(true);
    try {
      if (isSupabaseConfigured) {
        await sbEnrollSequence(prospect.id, enrollSeqId);
        await sbAddAction(prospect.id, {
          action_type: "sequence",
          description: `Inscrit dans la séquence #${enrollSeqId}`,
        });
        const freshActions = await sbGetActions(prospect.id);
        setActions(freshActions);
      } else {
        alert(`Prospect inscrit dans la séquence #${enrollSeqId} (mode démo).`);
      }
      setEnrollSeqId(null);
      alert("Prospect inscrit dans la séquence !");
    } catch (e: any) {
      alert("Erreur: " + e.message);
    } finally {
      setEnrolling(false);
    }
  };

  const pushOdoo = async () => {
    alert("Synchronisation Odoo simulée (mode démo) — Connectez le backend pour pousser vers Odoo.");
  };

  const handleFindContacts = async () => {
    setFindingContacts(true);
    try {
      const found = await findContacts({
        siret: prospect!.siret,
        site_web: prospect!.site_web,
        raison_sociale: prospect!.raison_sociale,
      });
      setContacts(found);
      if (found.length === 0) alert("Aucun contact trouvé. Vérifiez que le SIRET est renseigné.");
    } catch (e: any) {
      alert("Erreur: " + e.message);
    } finally {
      setFindingContacts(false);
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      setContactsCopied(email);
      setTimeout(() => setContactsCopied(null), 2000);
    });
  };

  const applyContact = async (c: FoundContact) => {
    const updates: Partial<Prospect> = {};
    if (c.prenom && !prospect!.contact_prenom) updates.contact_prenom = c.prenom;
    if (c.nom && !prospect!.contact_nom) updates.contact_nom = c.nom;
    if (c.qualite && !prospect!.contact_titre) updates.contact_titre = c.qualite;
    if (c.email && !prospect!.email) updates.email = c.email;
    if (Object.keys(updates).length === 0) { alert("Les champs sont déjà renseignés."); return; }
    try {
      const updated = isSupabaseConfigured
        ? await sbUpdateProspect(prospect!.id, updates)
        : mockApi.prospects.update(prospect!.id, updates);
      onUpdate(updated);
    } catch (e: any) {
      alert("Erreur: " + e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-[520px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full border",
                icpBg(prospect.icp_score),
                icpColor(prospect.icp_score)
              )}>
                ICP {prospect.icp_score}/100
              </span>
              <span className="text-xs text-slate-400">{SOURCE_LABELS[prospect.source]}</span>
              {isSupabaseConfigured && (
                <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded">
                  Live
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 truncate">{prospect.raison_sociale}</h2>
            {prospect.nom_commercial && (
              <p className="text-sm text-slate-500">{prospect.nom_commercial}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-3">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Status */}
          <div className="p-5 border-b">
            <p className="text-xs font-medium text-slate-500 mb-2">STATUT</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border font-medium transition-all",
                    prospect.status === s
                      ? STATUS_COLORS[s] + " ring-1 ring-current"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Contact info */}
          <div className="p-5 border-b space-y-2">
            <p className="text-xs font-medium text-slate-500 mb-3">COORDONNÉES</p>
            {prospect.tel && (
              <a href={`tel:${prospect.tel}`} className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-600">
                <Phone size={14} className="text-slate-400" />
                {prospect.tel}
              </a>
            )}
            {prospect.email && (
              <a href={`mailto:${prospect.email}`} className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-600">
                <Mail size={14} className={prospect.email_verified ? "text-green-500" : "text-slate-400"} />
                {prospect.email}
                {prospect.email_verified && (
                  <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">vérifié</span>
                )}
              </a>
            )}
            {prospect.site_web && (
              <a href={prospect.site_web} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-600">
                <Globe size={14} className="text-slate-400" />
                {prospect.site_web}
                <ExternalLink size={11} className="text-slate-400" />
              </a>
            )}
            {prospect.adresse && (
              <div className="flex items-start gap-2 text-sm text-slate-600">
                <MapPin size={14} className="text-slate-400 mt-0.5" />
                <span>{prospect.adresse}<br />{prospect.code_postal} {prospect.ville}</span>
              </div>
            )}
          </div>

          {/* Company info */}
          <div className="p-5 border-b space-y-2">
            <p className="text-xs font-medium text-slate-500 mb-3">ENTREPRISE</p>
            {prospect.siret && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-slate-400 text-xs w-14 shrink-0">SIRET</span>
                <span className="font-mono">{prospect.siret}</span>
              </div>
            )}
            {prospect.code_naf && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-slate-400 text-xs w-14 shrink-0">NAF</span>
                <span>{prospect.code_naf} — {NAF_LABELS[prospect.code_naf] ?? ""}</span>
              </div>
            )}
            {prospect.effectif && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-slate-400 text-xs w-14 shrink-0">Effectif</span>
                <span>{prospect.effectif} salariés</span>
              </div>
            )}
            {prospect.contact_prenom && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-slate-400 text-xs w-14 shrink-0">Contact</span>
                <span>{prospect.contact_prenom} {prospect.contact_nom} — {prospect.contact_titre}</span>
              </div>
            )}
          </div>

          {/* Actions rapides */}
          <div className="p-5 border-b">
            <p className="text-xs font-medium text-slate-500 mb-3">ACTIONS</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={logCall}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                <Phone size={12} /> Marquer appelé
              </button>
              <button
                onClick={handleFindContacts}
                disabled={findingContacts}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {findingContacts ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                {findingContacts ? "Recherche…" : "Trouver décideurs"}
              </button>
              <button
                onClick={pushOdoo}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg transition-colors"
              >
                <Send size={12} /> Sync Odoo
              </button>
            </div>
          </div>

          {/* Contacts décideurs */}
          {contacts.length > 0 && (
            <div className="p-5 border-b">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500">DÉCIDEURS TROUVÉS</p>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{contacts.length} contact{contacts.length > 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {contacts.map((c, i) => (
                  <div key={i} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {(c.prenom || c.nom) && (
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {c.prenom} {c.nom}
                          </p>
                        )}
                        <p className="text-xs text-slate-500">{c.qualite}</p>
                        {c.email && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-xs text-blue-700 truncate">{c.email}</span>
                            {c.email_confidence && (
                              <span className="text-[10px] text-slate-400 shrink-0">{c.email_confidence}%</span>
                            )}
                            <button
                              onClick={() => copyEmail(c.email!)}
                              className="text-slate-400 hover:text-slate-600 shrink-0"
                              title="Copier l'email"
                            >
                              {contactsCopied === c.email ? <CheckCircle size={11} className="text-green-500" /> : <Copy size={11} />}
                            </button>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Source : {c.source === "registre_officiel" ? "Registre officiel" : c.source === "pattern" ? "Pattern email" : c.source}
                          {" · "}Score : {c.decision_score}/100
                        </p>
                      </div>
                      <button
                        onClick={() => applyContact(c)}
                        className="text-xs px-2 py-1 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-600 rounded-lg transition-colors shrink-0"
                        title="Appliquer au prospect"
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Séquence */}
          <div className="p-5 border-b">
            <p className="text-xs font-medium text-slate-500 mb-3">SÉQUENCE EMAIL</p>
            <div className="flex gap-2">
              <select
                value={enrollSeqId ?? ""}
                onChange={(e) => setEnrollSeqId(Number(e.target.value) || null)}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
              >
                <option value="">Choisir une séquence…</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={enroll}
                disabled={!enrollSeqId || enrolling}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-40"
              >
                <Plus size={12} /> {enrolling ? "…" : "Inscrire"}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="p-5 border-b">
            <p className="text-xs font-medium text-slate-500 mb-2">NOTES</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              rows={4}
              placeholder="Ajouter des notes…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Timeline */}
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500 mb-3">HISTORIQUE</p>
            {actions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Aucune action enregistrée</p>
            ) : (
              <div className="space-y-3">
                {actions.map((action) => (
                  <div key={action.id} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      {action.action_type === "call" ? <Phone size={11} className="text-slate-500" /> :
                       action.action_type === "status_change" ? <CheckCircle size={11} className="text-blue-500" /> :
                       <Clock size={11} className="text-slate-500" />}
                    </div>
                    <div>
                      <p className="text-xs text-slate-700">{action.description}</p>
                      <p className="text-xs text-slate-400">
                        {format(new Date(action.created_at), "d MMM yyyy HH:mm", { locale: fr })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
