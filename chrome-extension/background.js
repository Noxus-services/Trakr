/**
 * Trakr Prospector — Service Worker (background)
 * Gère la communication entre content scripts et l'onglet Trakr.
 */

const TRAKR_URL = "https://trakr-prospector.vercel.app";
const STORAGE_KEY = "trakr_demo_prospects";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_PROSPECT") {
    handleSaveProspect(message.data).then(sendResponse);
    return true; // Async response
  }
  if (message.type === "GET_COUNT") {
    getProspectCount().then(sendResponse);
    return true;
  }
  if (message.type === "OPEN_TRAKR") {
    chrome.tabs.create({ url: TRAKR_URL });
    sendResponse({ ok: true });
  }
});

async function handleSaveProspect(data) {
  // 1. Essayer de sauvegarder dans un onglet Trakr ouvert
  const trakrTabs = await chrome.tabs.query({ url: `${TRAKR_URL}/*` });

  if (trakrTabs.length > 0) {
    try {
      const result = await chrome.tabs.sendMessage(trakrTabs[0].id, {
        type: "TRAKR_SAVE_PROSPECT",
        data,
      });
      if (result) return result;
    } catch (e) {
      // Onglet pas prêt, on utilise le stockage Chrome
    }
  }

  // 2. Fallback : stocker dans chrome.storage.local (synchronisé avec localStorage via popup)
  return await saveToStorage(data);
}

async function saveToStorage(data) {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const prospects = stored[STORAGE_KEY] || [];

  // Déduplication
  const duplicate = prospects.find(
    (p) => p.raison_sociale === data.raison_sociale && p.ville === data.ville
  );
  if (duplicate) return { duplicate: true, id: duplicate.id };

  // Score ICP rapide
  let icp_score = 0;
  if (data.tel) icp_score += 20;
  if (data.site_web) icp_score += 10;
  if (data.google_rating >= 3 && data.google_rating < 4) icp_score += 10; // signal hygiène potentiel
  if (data.email) icp_score += 15;

  const newProspect = {
    id: Date.now(),
    ...data,
    icp_score,
    status: "new",
    email_verified: false,
    unsubscribed: false,
    tags: [],
    notes: data.notes || "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _pending_sync: true, // sera synchronisé au prochain accès à Trakr
  };

  prospects.push(newProspect);
  await chrome.storage.local.set({ [STORAGE_KEY]: prospects });
  return { success: true, id: newProspect.id };
}

async function getProspectCount() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const prospects = stored[STORAGE_KEY] || [];
  return { count: prospects.length };
}

// Synchroniser chrome.storage → localStorage quand Trakr s'ouvre
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url?.startsWith(TRAKR_URL)
  ) {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const pending = (stored[STORAGE_KEY] || []).filter((p) => p._pending_sync);

    if (pending.length > 0) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "TRAKR_SYNC_PENDING",
          prospects: pending,
        });
        // Marquer comme synchronisés
        const all = stored[STORAGE_KEY] || [];
        const updated = all.map((p) => ({ ...p, _pending_sync: false }));
        await chrome.storage.local.set({ [STORAGE_KEY]: updated });
      } catch (e) {
        // L'onglet n'est pas encore prêt
      }
    }
  }
});
