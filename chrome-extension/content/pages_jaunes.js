/**
 * Trakr Prospector — Content script PagesJaunes
 * Ajoute un bouton "Sauvegarder" sur chaque fiche d'annuaire.
 */

function parsePhonePJ(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    return "+33" + digits.slice(1);
  }
  return raw;
}

function extractFromListing(card) {
  const data = { source: "pages_jaunes" };

  const nameEl = card.querySelector(".bi-denomination, .pj-a");
  data.raison_sociale = nameEl?.textContent?.trim() || "Inconnu";

  const addrEl = card.querySelector(".bi-address .street-address, .bi-address");
  if (addrEl) {
    const addrText = addrEl.textContent.trim();
    const cpMatch = addrText.match(/(\d{5})\s+([A-Za-zÀ-ÿ\s-]+)/);
    if (cpMatch) {
      data.code_postal = cpMatch[1];
      data.ville = cpMatch[2].trim();
    }
    data.adresse = addrText;
  }

  const phoneEl = card.querySelector(".bi-phone .coord-numero, .bi-phone a[href^='tel:']");
  if (phoneEl) {
    const raw = phoneEl.getAttribute("href")?.replace("tel:", "") || phoneEl.textContent;
    data.tel = parsePhonePJ(raw);
  }

  const webEl = card.querySelector("a.bi-website, a[class*='website']");
  if (webEl) data.site_web = webEl.href;

  const catEl = card.querySelector(".bi-tags, .type-activ");
  if (catEl) data.notes = catEl.textContent.trim();

  return data;
}

function addButtonToCard(card) {
  if (card.querySelector(".trakr-pj-btn")) return;

  const actionsEl = card.querySelector(".bi-contact, .bi-actions") || card;

  const btn = document.createElement("button");
  btn.className = "trakr-pj-btn";
  btn.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 8px; padding: 6px 12px;
    background: #2563eb; color: white;
    border: none; border-radius: 6px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    font-family: -apple-system, sans-serif;
    box-shadow: 0 2px 8px rgba(37,99,235,0.3);
    transition: all 0.2s;
  `;
  btn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
    Ajouter à Trakr
  `;

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const data = extractFromListing(card);
    btn.textContent = "Sauvegarde…";
    btn.style.background = "#64748b";

    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "SAVE_PROSPECT", data }, (r) => resolve(r || {}));
    });

    if (result.duplicate) {
      btn.style.background = "#64748b";
      btn.innerHTML = "✓ Déjà dans Trakr";
    } else if (result.success) {
      btn.style.background = "#16a34a";
      btn.innerHTML = "✓ Ajouté !";
    } else {
      btn.style.background = "#dc2626";
      btn.textContent = "Erreur";
    }
  });

  // Insérer le bouton
  const insertAfter = card.querySelector(".bi-contact") || card.querySelector(".bi-phone") || actionsEl;
  if (insertAfter && insertAfter.parentNode) {
    insertAfter.parentNode.insertBefore(btn, insertAfter.nextSibling);
  } else {
    card.appendChild(btn);
  }
}

function injectAllButtons() {
  const cards = document.querySelectorAll(".bi-content, .ann-body, .bi.bi-pro");
  cards.forEach(addButtonToCard);
}

// Injection initiale + observer pour pages dynamiques
setTimeout(injectAllButtons, 1000);

const observer = new MutationObserver(() => injectAllButtons());
observer.observe(document.body, { subtree: true, childList: true });
