/**
 * Contact Finder — trouve les décideurs d'une entreprise identifiée.
 * Sources : API officielle gouvernementale + patterns email.
 * Entièrement côté navigateur, aucune clé API requise.
 */

export interface FoundContact {
  prenom: string;
  nom: string;
  qualite: string;
  email?: string;
  email_confidence?: number;
  source: string;
  decision_score: number;
}

const ROLE_PRIORITY: Record<string, number> = {
  "gérant": 100,
  "président": 95,
  "directeur général": 90,
  "directeur": 85,
  "propriétaire": 85,
  "fondateur": 82,
  "responsable qse": 80,
  "responsable qualité": 78,
  "responsable hygiène": 78,
  "chef de cuisine": 60,
  "responsable": 55,
  "autre": 30,
};

function scoreContact(c: FoundContact): number {
  const sourceScores: Record<string, number> = {
    registre_officiel: 40,
    pappers: 38,
  };
  let score = sourceScores[c.source] ?? 10;
  const qualite = (c.qualite || "").toLowerCase();
  for (const [role, pts] of Object.entries(ROLE_PRIORITY)) {
    if (qualite.includes(role)) { score += pts / 2; break; }
  }
  if (c.email) score += 20;
  score += (c.email_confidence ?? 0) / 10;
  return Math.min(Math.round(score), 100);
}

// ── Dirigeants depuis API officielle ───────────────────────────────────────────
async function getDirigeants(siret: string): Promise<FoundContact[]> {
  const siren = siret.slice(0, 9);
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  const entreprise = json.results?.[0];
  if (!entreprise) return [];

  const contacts: FoundContact[] = [];
  for (const d of entreprise.dirigeants ?? []) {
    const prenom = (d.prenom || "").trim();
    const nom = (d.nom || d.nom_complet || "").trim().toUpperCase();
    if (!nom) continue;
    const c: FoundContact = {
      prenom,
      nom,
      qualite: d.qualite || "Dirigeant",
      source: "registre_officiel",
      decision_score: 0,
    };
    c.decision_score = scoreContact(c);
    contacts.push(c);
  }
  return contacts;
}

// ── Génération patterns email ──────────────────────────────────────────────────
function normalize(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "");
}

function generateEmailPatterns(prenom: string, nom: string, domain: string): { email: string; confidence: number }[] {
  if (!prenom || !nom || !domain) return [];
  const p = normalize(prenom);
  const n = normalize(nom);
  const p1 = prenom[0] ? normalize(prenom[0]) : "";
  return [
    { email: `${p}.${n}@${domain}`, confidence: 88 },
    { email: `${p1}.${n}@${domain}`, confidence: 75 },
    { email: `${p}${n}@${domain}`, confidence: 65 },
    { email: `${p1}${n}@${domain}`, confidence: 60 },
    { email: `${n}.${p}@${domain}`, confidence: 55 },
    { email: `contact@${domain}`, confidence: 40 },
  ];
}

function extractDomain(siteWeb?: string): string {
  if (!siteWeb) return "";
  try {
    const url = siteWeb.startsWith("http") ? siteWeb : "https://" + siteWeb;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ── Orchestrateur principal ────────────────────────────────────────────────────
export async function findContacts(prospect: {
  siret?: string;
  site_web?: string;
  raison_sociale: string;
}): Promise<FoundContact[]> {
  const contacts: FoundContact[] = [];

  // 1. Dirigeants officiels
  if (prospect.siret) {
    const dirigeants = await getDirigeants(prospect.siret).catch(() => []);
    contacts.push(...dirigeants);
  }

  // 2. Si dirigeants trouvés + site web → enrichir avec emails par pattern
  const domain = extractDomain(prospect.site_web);
  if (domain) {
    for (const c of contacts) {
      if (!c.email && c.prenom && c.nom) {
        const patterns = generateEmailPatterns(c.prenom, c.nom, domain);
        if (patterns.length > 0) {
          c.email = patterns[0].email;
          c.email_confidence = patterns[0].confidence;
        }
      }
    }

    // 3. Ajouter email générique si pas déjà présent
    const genericExists = contacts.some(c => c.email?.startsWith("contact@"));
    if (!genericExists) {
      contacts.push({
        prenom: "",
        nom: "",
        qualite: "Email générique",
        email: `contact@${domain}`,
        email_confidence: 40,
        source: "pattern",
        decision_score: 20,
      });
    }
  }

  // 4. Si rien trouvé via SIRET mais on a un site → patterns génériques
  if (contacts.length === 0 && domain) {
    contacts.push(
      { prenom: "", nom: "", qualite: "Email générique", email: `contact@${domain}`, email_confidence: 40, source: "pattern", decision_score: 20 },
      { prenom: "", nom: "", qualite: "Email info", email: `info@${domain}`, email_confidence: 30, source: "pattern", decision_score: 15 },
      { prenom: "", nom: "", qualite: "Email direction", email: `direction@${domain}`, email_confidence: 25, source: "pattern", decision_score: 12 },
    );
  }

  // 5. Re-score et tri
  contacts.forEach(c => { c.decision_score = scoreContact(c); });
  return contacts.sort((a, b) => b.decision_score - a.decision_score);
}

export { generateEmailPatterns, extractDomain };
