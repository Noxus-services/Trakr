const STORAGE_KEY = "trakr_demo_prospects";

async function load() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const prospects = stored[STORAGE_KEY] || [];

  document.getElementById("count-total").textContent = prospects.length;
  document.getElementById("count-pending").textContent =
    prospects.filter((p) => p.status === "new").length;

  const list = document.getElementById("recent-list");
  const recent = prospects.slice(-4).reverse();

  if (recent.length === 0) {
    list.innerHTML = '<div class="empty-state">Aucune capture récente</div>';
    return;
  }

  list.innerHTML = recent.map((p) => `
    <div class="prospect-item">
      <div class="prospect-dot"></div>
      <div class="prospect-name" title="${p.raison_sociale}">${p.raison_sociale}</div>
      <div class="prospect-src">${p.source === "google_maps" ? "🗺️" : "📒"} ${p.ville || ""}</div>
    </div>
  `).join("");
}

document.getElementById("btn-sync").addEventListener("click", async () => {
  const btn = document.getElementById("btn-sync");
  btn.textContent = "Synchronisation…";
  // Ouvrir Trakr pour déclencher la sync automatique
  chrome.tabs.create({ url: "https://trakr-prospector.vercel.app/pipeline" });
  window.close();
});

load();
