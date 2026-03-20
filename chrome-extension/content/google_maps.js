/**
 * Trakr Prospector — Content script Google Maps
 * Injecte un bouton "Sauvegarder dans Trakr" sur les fiches d'établissements.
 */

const TRAKR_APP_URL = "https://trakr-prospector.vercel.app";

// ── Utilitaires ───────────────────────────────────────────────────────────────

function showToast(message, type = "success") {
  let toast = document.getElementById("trakr-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "trakr-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `trakr-toast-${type} show`;
  setTimeout(() => { toast.className = `trakr-toast-${type}`; }, 3000);
}

function extractPostalCode(address) {
  const m = address.match(/\b\d{5}\b/);
  return m ? m[0] : null;
}

function extractCity(address) {
  // Exemple : "12 Rue de la Paix, 69001 Lyon, France"
  const m = address.match(/\d{5}\s+([^,]+)/);
  return m ? m[1].trim() : null;
}

function parsePhone(raw) {
  if (!raw) return null;
  return raw.replace(/\s/g, "").replace(/^0/, "+33");
}

// ── Extraction des données depuis la page Maps ────────────────────────────────

function extractPlaceData() {
  const data = {};

  // Nom de l'établissement
  const nameEl = document.querySelector('h1[class*="fontHeadlineLarge"], h1.DUwDvf, [data-item-id="businessName"] span');
  data.raison_sociale = nameEl?.textContent?.trim() || document.title.replace(" - Google Maps", "").trim();

  // Adresse
  const addrEl = document.querySelector('[data-item-id="address"] .Io6YTe, button[data-item-id="address"] .Io6YTe');
  if (addrEl) {
    data.adresse = addrEl.textContent.trim();
    data.code_postal = extractPostalCode(data.adresse);
    data.ville = extractCity(data.adresse);
  }

  // Téléphone
  const phoneEl = document.querySelector('[data-item-id^="phone"] .Io6YTe, [data-tooltip="Appeler"] .Io6YTe');
  if (phoneEl) data.tel = parsePhone(phoneEl.textContent.trim());

  // Site web
  const webEl = document.querySelector('[data-item-id="authority"] .Io6YTe, a[data-item-id="authority"]');
  if (webEl) data.site_web = webEl.href || webEl.textContent.trim();

  // Note
  const ratingEl = document.querySelector('.fontDisplayLarge, span[aria-hidden="true"][class*="fontDisplayLarge"]');
  if (ratingEl) data.google_rating = parseFloat(ratingEl.textContent.replace(",", ".")) || null;

  // URL Google Maps (pour le place_id)
  const urlMatch = window.location.href.match(/place\/([^/@]+)\//);
  if (urlMatch) data.nom_commercial = urlMatch[1].replace(/\+/g, " ");

  data.source = "google_maps";
  return data;
}

// ── Sauvegarde dans Trakr (localStorage partagé via message) ─────────────────

function saveToTrakr(prospectData) {
  const STORAGE_KEY = "trakr_demo_prospects";
  const raw = localStorage.getItem(STORAGE_KEY);
  const prospects = raw ? JSON.parse(raw) : [];

  // Vérifier doublon
  const existing = prospects.find(p =>
    (prospectData.raison_sociale && p.raison_sociale === prospectData.raison_sociale && p.ville === prospectData.ville)
  );
  if (existing) return { duplicate: true, id: existing.id };

  // Calculer score ICP
  const TARGET_NAF = new Set(["5610A", "5610C", "5630Z", "5510Z", "4711D", "1013A", "1089Z"]);
  let icp_score = 0;
  if (prospectData.tel) icp_score += 20;
  if (prospectData.site_web) icp_score += 10;
  if (prospectData.google_rating && prospectData.google_rating >= 4.0) icp_score += 5;

  const newProspect = {
    id: Date.now(),
    ...prospectData,
    icp_score,
    status: "new",
    email_verified: false,
    unsubscribed: false,
    email: prospectData.email || undefined,
    tags: [],
    notes: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  prospects.push(newProspect);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prospects));
  return { success: true, id: newProspect.id };
}

// ── Injection du bouton ───────────────────────────────────────────────────────

function injectButton() {
  if (document.getElementById("trakr-btn")) return;

  const btn = document.createElement("button");
  btn.id = "trakr-btn";
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
    Sauvegarder dans Trakr
  `;

  btn.addEventListener("click", async () => {
    btn.classList.add("trakr-loading");
    btn.textContent = "Sauvegarde…";

    const data = extractPlaceData();

    // Sauvegarder dans l'onglet Trakr s'il est ouvert, sinon via message background
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "SAVE_PROSPECT", data },
        (response) => resolve(response || { error: "Pas de réponse" })
      );
    });

    if (result.duplicate) {
      btn.classList.remove("trakr-loading");
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        Déjà dans Trakr
      `;
      showToast("⚠️ Ce prospect est déjà dans votre liste", "error");
      setTimeout(() => resetBtn(btn), 3000);
    } else if (result.success) {
      btn.classList.remove("trakr-loading");
      btn.classList.add("trakr-success");
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        Sauvegardé !
      `;
      showToast(`✓ "${data.raison_sociale}" ajouté à Trakr`, "success");
      setTimeout(() => resetBtn(btn), 3000);
    } else {
      btn.classList.remove("trakr-loading");
      showToast("Erreur : " + (result.error || "inconnue"), "error");
      resetBtn(btn);
    }
  });

  document.body.appendChild(btn);
}

function resetBtn(btn) {
  btn.className = "";
  btn.id = "trakr-btn";
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
    Sauvegarder dans Trakr
  `;
}

// ── Observer les changements de page (Maps est une SPA) ──────────────────────

let lastUrl = "";

function checkAndInject() {
  const url = window.location.href;

  // Montrer le bouton uniquement sur une fiche d'établissement
  const isPlace = url.includes("/maps/place/") || url.includes("maps/search/");

  if (isPlace && url !== lastUrl) {
    lastUrl = url;
    // Petit délai pour laisser le DOM se charger
    setTimeout(injectButton, 1500);
  } else if (!isPlace) {
    const btn = document.getElementById("trakr-btn");
    if (btn) btn.remove();
    lastUrl = "";
  }
}

// Observer les changements d'URL (navigation SPA)
const observer = new MutationObserver(checkAndInject);
observer.observe(document.body, { subtree: true, childList: true });

checkAndInject();
