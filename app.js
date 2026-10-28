const STORAGE_KEY_V2 = 'riftbound_card_tracker_v2';
const STORAGE_KEY_V1 = 'riftbound_card_tracker_v1';

const DOMAIN_META = {
  Fury:    { icon: '🔴', label: 'Fury',    bg1: '#7f1d1d', bg2: '#dc2626', accent: '#fca5a5' },
  Calm:    { icon: '🟢', label: 'Calm',    bg1: '#064e3b', bg2: '#10b981', accent: '#6ee7b7' },
  Mind:    { icon: '🔵', label: 'Mind',    bg1: '#1e3a8a', bg2: '#3b82f6', accent: '#93c5fd' },
  Body:    { icon: '🟡', label: 'Body',    bg1: '#78350f', bg2: '#f59e0b', accent: '#fde68a' },
  Chaos:   { icon: '🟣', label: 'Chaos',   bg1: '#4c1d95', bg2: '#9333ea', accent: '#d8b4fe' },
  Order:   { icon: '🟠', label: 'Order',   bg1: '#7c2d12', bg2: '#ea580c', accent: '#fdba74' },
  Neutral: { icon: '⚪', label: 'Neutral', bg1: '#1e293b', bg2: '#475569', accent: '#cbd5e1' }
};

const TYPE_ICON = {
  'Legend': '👑',
  'Champion': '⚔️',
  'Unit': '🛡️',
  'Spell': '🔥',
  'Signature Spell': '✨',
  'Gear': '⚙️',
  'Battlefield': '🏰',
  'Rune': '💎'
};

const RARITY_ORDER = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Showcase: 5
};

const state = {
  cards: [],
  search: '',
  ownership: 'all',
  domain: 'all',
  set: 'all',
  type: 'all',
  rarity: 'all',
  sort: 'number',
  viewMode: 'table',
  activeLightboxCardId: null
};

function generateCardSvgDataUri(card) {
  const d = DOMAIN_META[card.domain] || DOMAIN_META.Neutral;
  const tIcon = TYPE_ICON[card.type] || '🃏';
  const safeNumber = String(card.number || 'OGN').replace(/[<>&"']/g, '');
  const safeName = String(card.name || 'Karte').replace(/[<>&"']/g, '');
  const safeType = String(card.type || 'Unit').replace(/[<>&"']/g, '');
  const safeRarity = String(card.rarity || 'Common').replace(/[<>&"']/g, '');

  const words = safeName.split(' ');
  let line1 = '';
  let line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= 18) {
      line1 = (line1 + ' ' + w).trim();
    } else {
      line2 = (line2 + ' ' + w).trim();
    }
  }
  if (line2.length > 20) {
    line2 = line2.slice(0, 18) + '…';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350" width="250" height="350">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${d.bg1}"/>
        <stop offset="60%" stop-color="${d.bg2}"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="frame" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${d.accent}" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.15"/>
      </linearGradient>
    </defs>
    <rect width="250" height="350" rx="16" fill="url(#bg)"/>
    <rect x="10" y="10" width="230" height="330" rx="12" fill="none" stroke="url(#frame)" stroke-width="2"/>
    <rect x="18" y="44" width="214" height="175" rx="8" fill="#090d16" fill-opacity="0.45" stroke="${d.accent}" stroke-opacity="0.35" stroke-width="1"/>
    <circle cx="125" cy="132" r="46" fill="${d.bg2}" fill-opacity="0.35" stroke="${d.accent}" stroke-opacity="0.5" stroke-width="1.5"/>
    <text x="125" y="147" font-family="sans-serif" font-size="44" text-anchor="middle">${tIcon}</text>
    <text x="22" y="31" font-family="monospace" font-weight="bold" font-size="13" fill="${d.accent}">${safeNumber}</text>
    <text x="228" y="31" font-family="sans-serif" font-weight="bold" font-size="12" fill="#ffffff" fill-opacity="0.9" text-anchor="end">${d.label.toUpperCase()}</text>
    <rect x="18" y="232" width="214" height="94" rx="8" fill="#090d16" fill-opacity="0.72" stroke="${d.accent}" stroke-opacity="0.3" stroke-width="1"/>
    <text x="125" y="260" font-family="sans-serif" font-weight="bold" font-size="15" fill="#ffffff" text-anchor="middle">${line1}</text>
    <text x="125" y="280" font-family="sans-serif" font-weight="bold" font-size="14" fill="#e2e8f0" text-anchor="middle">${line2}</text>
    <text x="125" y="310" font-family="sans-serif" font-size="11" fill="${d.accent}" text-anchor="middle">${safeType} • ${safeRarity}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function getCardPrimaryImageUrl(card) {
  if (card.imageUrl && card.imageUrl.trim() !== '') {
    return card.imageUrl.trim();
  }
  return generateCardSvgDataUri(card);
}

function handleCardImageError(imgEl, cardId) {
  if (imgEl.dataset.fallbackApplied === 'true') return;
  imgEl.dataset.fallbackApplied = 'true';
  const card = state.cards.find(c => c.id === cardId);
  if (card) {
    imgEl.src = generateCardSvgDataUri(card);
  }
}

let persistenceEnabled = true;
function setStorageStatus(message, error = false) {
  const el = document.getElementById('storageStatus');
  el.textContent = message;
  el.classList.toggle('text-red-300', error);
}
async function loadCollection() {
  try {
    state.cards = window.CollectionModel.merge(window.DEFAULT_RIFTBOUND_CARDS || [], await window.CollectionStorage.load());
    const review = state.cards.filter(c => c.migrationReview).length;
    setStorageStatus(review ? `${review} bisherige Einträge zur Prüfung erhalten.` : 'Sammlung geladen.');
  } catch (error) {
    persistenceEnabled = false;
    state.cards = (window.DEFAULT_RIFTBOUND_CARDS || []).map(c => ({...c}));
    setStorageStatus('Gespeicherte Sammlung konnte nicht gelesen werden. Bitte Backup sichern und Seite neu laden; Speichern ist gesperrt.', true);
  }
}
function saveCollection() {
  if (!persistenceEnabled) return Promise.resolve(false);
  const record = window.CollectionModel.snapshot(state.cards, window.DEFAULT_RIFTBOUND_CARDS || []);
  setStorageStatus('Wird gespeichert …');
  return window.CollectionStorage.save(record).then(mode => {
    setStorageStatus(`Gespeichert · ${mode}`);
    return true;
  }).catch(() => {
    setStorageStatus('Speichern fehlgeschlagen. Bitte jetzt ein JSON-Backup herunterladen.', true);
    return false;
  });
}
function cardDomains(card) { return card.domains?.length ? card.domains : [card.domain || 'Neutral']; }
function cardLabel(card) {
  return card.name + (card.variant ? ` [${card.variant}]` : '') + (card.preview ? ' [Vorschau]' : '') + (card.migrationReview ? ' [Zuordnung prüfen]' : '');
}
function canCount(card, field) {
  return !card.finishes || (field === 'foil' ? card.finishes.includes('foil') : card.specialFinish || card.finishes.includes('normal'));
}
function refreshCatalogControls() {
  for (const [id, values] of [
    ['filterSet', [...new Set(state.cards.map(c=>c.set))]],
    ['modalSet', [...new Set([...state.cards.map(c=>c.set), 'PRM'])]],
    ['filterType', [...new Set(state.cards.map(c=>c.type))]],
    ['modalType', [...new Set([...state.cards.map(c=>c.type), ...Object.keys(TYPE_ICON)])]],
    ['filterRarity', [...new Set(state.cards.map(c=>c.rarity))]],
    ['modalRarity', [...new Set(state.cards.map(c=>c.rarity))]]
  ]) {
    const el=document.getElementById(id), selected=el.value;
    el.innerHTML=(id.startsWith('filter') ? '<option value="all">Alle</option>' : '') + values.sort().map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if ([...el.options].some(o=>o.value===selected)) el.value=selected;
  }
  const meta=window.OPENRIFT_CATALOG_META;
  if(meta) document.getElementById('catalogStatus').textContent=`${meta.cardCount} Varianten · ${meta.printingCount} Druckeinträge · Stand ${meta.importedAt.slice(0,10)}`;
}

function getPlaysetTarget(card) {
  if (card.type === 'Legend' || card.type === 'Battlefield') return 1;
  return 3;
}

function updateCardCount(cardId, field, newValue) {
  const idx = state.cards.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  if (!canCount(state.cards[idx], field)) return;
  const cleanVal = Math.max(0, Math.min(999, parseInt(newValue, 10) || 0));
  state.cards[idx][field] = cleanVal;
  saveCollection();
  renderAll();
  if (state.activeLightboxCardId === cardId) {
    syncLightboxView(cardId);
  }
}

function adjustCardCount(cardId, field, delta) {
  const idx = state.cards.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  const current = state.cards[idx][field] || 0;
  updateCardCount(cardId, field, current + delta);
}

function getFilteredCards() {
  const q = state.search.trim().toLowerCase();

  const filtered = state.cards.filter(card => {
    const total = (card.normal || 0) + (card.foil || 0);
    const target = getPlaysetTarget(card);

    if (q) {
      const matchName = card.name.toLowerCase().includes(q);
      const matchNum = card.number.toLowerCase().includes(q);
      const matchType = card.type.toLowerCase().includes(q);
      const matchDomain = cardDomains(card).join(' ').toLowerCase().includes(q);
      const matchVariant = cardLabel(card).toLowerCase().includes(q);
      if (!matchName && !matchNum && !matchType && !matchDomain && !matchVariant) return false;
    }

    if (state.ownership === 'owned' && total === 0) return false;
    if (state.ownership === 'foil' && (card.foil || 0) === 0) return false;
    if (state.ownership === 'missing' && total > 0) return false;
    if (state.ownership === 'incomplete' && total >= target) return false;
    if (state.ownership === 'playset' && total < target) return false;

    if (state.domain !== 'all' && !cardDomains(card).includes(state.domain)) return false;
    if (state.set !== 'all' && card.set !== state.set) return false;
    if (state.type !== 'all' && card.type !== state.type) return false;
    if (state.rarity !== 'all' && card.rarity !== state.rarity) return false;

    return true;
  });

  filtered.sort((a, b) => {
    if (state.sort === 'name') {
      return a.name.localeCompare(b.name, 'de');
    }
    if (state.sort === 'total_desc') {
      const totA = (a.normal || 0) + (a.foil || 0);
      const totB = (b.normal || 0) + (b.foil || 0);
      return totB - totA || a.number.localeCompare(b.number);
    }
    if (state.sort === 'foil_desc') {
      return (b.foil || 0) - (a.foil || 0) || a.number.localeCompare(b.number);
    }
    if (state.sort === 'domain') {
      return a.domain.localeCompare(b.domain) || a.number.localeCompare(b.number);
    }
    if (state.sort === 'rarity') {
      return (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0) || a.number.localeCompare(b.number);
    }
    return a.number.localeCompare(b.number, undefined, { numeric: true });
  });

  return filtered;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPlaysetDots(total, target) {
  let dots = '';
  for (let i = 1; i <= target; i++) {
    const filled = total >= i;
    dots += `<span class="inline-block w-2 h-2 rounded-full ${filled ? 'bg-indigo-500' : 'bg-slate-700 border border-slate-600'}"></span>`;
  }
  return dots;
}

function renderStats() {
  let totalNormal = 0;
  let totalFoil = 0;
  let uniqueOwned = 0;
  let playsets = 0;

  for (const c of state.cards) {
    const n = c.normal || 0;
    const f = c.foil || 0;
    const tot = n + f;
    totalNormal += n;
    totalFoil += f;
    if (tot > 0) uniqueOwned++;
    if (tot >= getPlaysetTarget(c)) playsets++;
  }

  const grandTotal = totalNormal + totalFoil;
  const catalogSize = state.cards.length;
  const uniquePct = catalogSize > 0 ? Math.round((uniqueOwned / catalogSize) * 100) : 0;
  const foilPct = grandTotal > 0 ? Math.round((totalFoil / grandTotal) * 100) : 0;

  document.getElementById('statTotalCopies').textContent = grandTotal.toLocaleString('de-DE');
  document.getElementById('statNormalBreakdown').textContent = `(${totalNormal.toLocaleString('de-DE')} Normal / Sonderfinish)`;
  document.getElementById('statFoilCopies').textContent = totalFoil.toLocaleString('de-DE');
  document.getElementById('statFoilRatio').textContent = `${foilPct}% Foil-Anteil`;
  document.getElementById('statUniqueOwned').textContent = uniqueOwned.toLocaleString('de-DE');
  document.getElementById('statTotalCatalog').textContent = catalogSize.toLocaleString('de-DE');
  document.getElementById('statUniquePercent').textContent = `${uniquePct}%`;
  document.getElementById('statProgressBar').style.width = `${uniquePct}%`;
  document.getElementById('statPlaysets').textContent = playsets.toLocaleString('de-DE');

  const dl = document.getElementById('catalogAutocomplete');
  dl.innerHTML = state.cards
    .map(c => `<option value="${escapeHtml(c.number)} – ${escapeHtml(cardLabel(c))} | ${escapeHtml(c.id)}"></option>`)
    .join('');
}

function renderListAndGrid() {
  const filtered = getFilteredCards();
  const totalCatalog = state.cards.length;
  document.getElementById('resultsCounter').textContent =
    `Zeige ${filtered.length} von ${totalCatalog} Karten • Klicke auf ein Kartenbild für die Großansicht 🔍`;

  const hasFilters =
    state.search !== '' ||
    state.ownership !== 'all' ||
    state.domain !== 'all' ||
    state.set !== 'all' ||
    state.type !== 'all' ||
    state.rarity !== 'all';

  document.getElementById('btnResetFilters').classList.toggle('hidden', !hasFilters);
  document.getElementById('btnClearSearch').classList.toggle('hidden', state.search === '');

  const emptyEl = document.getElementById('emptyState');
  const tableContainer = document.getElementById('tableContainer');
  const gridContainer = document.getElementById('gridContainer');

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
    tableContainer.classList.add('hidden');
    gridContainer.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  if (state.viewMode === 'table') {
    tableContainer.classList.remove('hidden');
    gridContainer.classList.add('hidden');
    renderTableRows(filtered);
  } else {
    tableContainer.classList.add('hidden');
    gridContainer.classList.remove('hidden');
    renderGridCards(filtered);
  }
}

function renderTableRows(cards) {
  const tbody = document.getElementById('cardTableBody');
  tbody.innerHTML = cards.map(card => {
    const normal = card.normal || 0;
    const foil = card.foil || 0;
    const total = normal + foil;
    const target = getPlaysetTarget(card);
    const dMeta = DOMAIN_META[card.domain] || DOMAIN_META.Neutral;
    const imgUrl = getCardPrimaryImageUrl(card);

    return `
      <tr class="group hover:bg-slate-800/60 transition">
        <td class="py-2 px-4">
          <div class="flex items-center gap-3">
            <button
              type="button"
              onclick="openLightbox('${escapeHtml(card.id)}')"
              class="relative w-10 h-14 rounded-md overflow-hidden border border-slate-700 bg-slate-950 shrink-0 cursor-pointer shadow-xs group-hover:scale-105 transition-transform ${foil > 0 ? 'foil-active-border' : ''}"
              title="Kartenbild vergrößern"
            >
              <img
                src="${escapeHtml(imgUrl)}"
                alt="${escapeHtml(cardLabel(card))}"
                loading="lazy"
                onerror="handleCardImageError(this, '${escapeHtml(card.id)}')"
                class="w-full h-full object-cover ${total === 0 ? 'card-unowned-img' : ''}"
              />
              ${foil > 0 ? '<div class="absolute inset-0 foil-image-glare"></div>' : ''}
            </button>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono text-xs font-semibold text-slate-400">${escapeHtml(card.number)}</span>
                ${foil > 0 ? `<span class="text-xs px-2 py-0.5 rounded-full foil-badge font-semibold text-amber-200">✨ ${foil}× Foil</span>` : ''}
              </div>
              <div class="font-semibold text-sm text-slate-100 truncate">${card.sourceUrl ? `<a href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cardLabel(card))} ↗</a>` : escapeHtml(cardLabel(card))}</div>
            </div>
          </div>
        </td>
        <td class="py-2 px-3 whitespace-nowrap">
          <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
            <span>${dMeta.icon}</span>
            <span>${escapeHtml(cardDomains(card).join(' / '))}</span>
          </span>
        </td>
        <td class="py-2 px-3 whitespace-nowrap">
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-slate-200 font-medium">${escapeHtml(card.type)}</span>
            <span class="text-slate-500">•</span>
            <span class="text-slate-400">${escapeHtml(card.rarity)}</span>
          </div>
        </td>
        <td class="py-2 px-4">
          <div class="flex items-center justify-center gap-1">
            <button type="button" ${!canCount(card,'normal') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'normal', -1)" class="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 font-bold text-xs cursor-pointer">−</button>
            <input
              type="number"
              min="0"
              max="999"
              value="${normal}" ${!canCount(card,'normal') ? 'disabled' : ''}
              onchange="updateCardCount('${escapeHtml(card.id)}', 'normal', this.value)"
              class="w-12 h-7 text-center rounded-lg text-xs font-bold bg-slate-900 text-slate-100 border border-slate-700"
            />
            <button type="button" ${!canCount(card,'normal') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'normal', 1)" class="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 font-bold text-xs cursor-pointer">＋</button>
          </div>
        </td>
        <td class="py-2 px-4">
          <div class="flex items-center justify-center gap-1">
            <button type="button" ${!canCount(card,'foil') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'foil', -1)" class="w-7 h-7 rounded-lg foil-badge border border-amber-500/40 hover:opacity-80 font-bold text-xs cursor-pointer">−</button>
            <input
              type="number"
              min="0"
              max="999"
              value="${foil}" ${!canCount(card,'foil') ? 'disabled' : ''}
              onchange="updateCardCount('${escapeHtml(card.id)}', 'foil', this.value)"
              class="w-12 h-7 text-center rounded-lg text-xs font-bold bg-slate-900 text-amber-200 border border-amber-500/40 ${foil > 0 ? 'foil-badge' : ''}"
            />
            <button type="button" ${!canCount(card,'foil') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'foil', 1)" class="w-7 h-7 rounded-lg foil-badge border border-amber-500/40 hover:opacity-80 font-bold text-xs cursor-pointer">＋</button>
          </div>
        </td>
        <td class="py-2 px-3 text-center whitespace-nowrap">
          <div class="inline-flex flex-col items-center gap-1">
            <span class="text-xs font-bold ${total >= target ? 'text-emerald-400' : 'text-slate-400'}">
              ${total} / ${target}
            </span>
            <div class="flex items-center gap-1">
              ${renderPlaysetDots(total, target)}
            </div>
          </div>
        </td>
        <td class="py-2 px-3 text-right whitespace-nowrap">
          <button type="button" onclick="openEditModal('${escapeHtml(card.id)}')" class="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 cursor-pointer" title="Karte &amp; Bild bearbeiten">
            ✎
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderGridCards(cards) {
  const grid = document.getElementById('gridContainer');
  grid.innerHTML = cards.map(card => {
    const normal = card.normal || 0;
    const foil = card.foil || 0;
    const total = normal + foil;
    const target = getPlaysetTarget(card);
    const dMeta = DOMAIN_META[card.domain] || DOMAIN_META.Neutral;
    const imgUrl = getCardPrimaryImageUrl(card);

    return `
      <div class="group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between transition ${foil > 0 ? 'foil-active-border' : ''}">
        <div class="relative w-full card-aspect bg-slate-950 overflow-hidden border-b border-slate-800">
          <img
            src="${escapeHtml(imgUrl)}"
            alt="${escapeHtml(cardLabel(card))}"
            loading="lazy"
            onclick="openLightbox('${escapeHtml(card.id)}')"
            onerror="handleCardImageError(this, '${escapeHtml(card.id)}')"
            class="w-full h-full object-cover cursor-pointer group-hover:scale-103 transition-transform duration-300 ${total === 0 ? 'card-unowned-img' : ''}"
          />
          ${foil > 0 ? '<div class="absolute inset-0 foil-image-glare"></div>' : ''}

          <div class="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <span class="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-black/75 text-slate-100 backdrop-blur-xs">
              ${escapeHtml(card.number)}
            </span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-black/75 text-slate-100 backdrop-blur-xs">
              ${dMeta.icon} ${escapeHtml(cardDomains(card).join(' / '))}
            </span>
          </div>

          <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            ${foil > 0
              ? `<span class="text-xs px-2 py-0.5 rounded-full foil-badge font-bold text-amber-200 bg-black/70 backdrop-blur-xs">✨ ${foil}× Foil</span>`
              : `<span></span>`
            }
            <button
              type="button"
              onclick="openEditModal('${escapeHtml(card.id)}')"
              class="pointer-events-auto text-xs px-2 py-0.5 rounded-md bg-black/75 text-slate-200 hover:bg-black/95 cursor-pointer"
              title="Karte &amp; Bild bearbeiten"
            >
              ✎
            </button>
          </div>
        </div>

        <div class="p-3 space-y-2.5 flex-1 flex flex-col justify-between">
          <div>
            <h3 class="font-bold text-sm text-slate-100 leading-snug truncate" title="${escapeHtml(cardLabel(card))}">
              ${card.sourceUrl ? `<a href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cardLabel(card))} ↗</a>` : escapeHtml(cardLabel(card))}
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(card.type)} • ${escapeHtml(card.rarity)}</p>
          </div>

          <div class="space-y-1.5 pt-2 border-t border-slate-800">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-slate-400">${card.specialFinish ? escapeHtml(card.finishes.join(' / ')) : 'Normal'}:</span>
              <div class="flex items-center gap-1">
                <button type="button" ${!canCount(card,'normal') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'normal', -1)" class="w-6 h-6 rounded bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs cursor-pointer">−</button>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value="${normal}" ${!canCount(card,'normal') ? 'disabled' : ''}
                  onchange="updateCardCount('${escapeHtml(card.id)}', 'normal', this.value)"
                  class="w-10 h-6 text-center rounded text-xs font-bold bg-slate-950 text-slate-100 border border-slate-700"
                />
                <button type="button" ${!canCount(card,'normal') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'normal', 1)" class="w-6 h-6 rounded bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs cursor-pointer">＋</button>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold px-1.5 py-0.5 rounded foil-badge text-amber-200">Foil ✨:</span>
              <div class="flex items-center gap-1">
                <button type="button" ${!canCount(card,'foil') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'foil', -1)" class="w-6 h-6 rounded foil-badge border border-amber-500/40 font-bold text-xs cursor-pointer">−</button>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value="${foil}" ${!canCount(card,'foil') ? 'disabled' : ''}
                  onchange="updateCardCount('${escapeHtml(card.id)}', 'foil', this.value)"
                  class="w-10 h-6 text-center rounded text-xs font-bold bg-slate-950 text-amber-200 border border-amber-500/40"
                />
                <button type="button" ${!canCount(card,'foil') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'foil', 1)" class="w-6 h-6 rounded foil-badge border border-amber-500/40 font-bold text-xs cursor-pointer">＋</button>
              </div>
            </div>

            <div class="flex items-center justify-between pt-1">
              <span class="text-xs text-slate-400">Besitz: <strong class="text-slate-100">${total} / ${target}</strong></span>
              <div class="flex items-center gap-1">
                ${renderPlaysetDots(total, target)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAll() {
  renderStats();
  renderListAndGrid();
}

function openLightbox(cardId) {
  state.activeLightboxCardId = cardId;
  syncLightboxView(cardId);
  document.getElementById('lightboxModal').classList.remove('hidden');
}

function syncLightboxView(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  const normal = card.normal || 0;
  const foil = card.foil || 0;
  const total = normal + foil;
  const target = getPlaysetTarget(card);
  const dMeta = DOMAIN_META[card.domain] || DOMAIN_META.Neutral;

  document.getElementById('lightboxNumber').textContent = card.number;
  document.getElementById('lightboxName').textContent = cardLabel(card);
  document.getElementById('lightboxMeta').textContent = `${dMeta.icon} ${cardDomains(card).join(' / ')} • ${card.type} • ${card.rarity}`;
  document.getElementById('lightboxRules').textContent = [card.rulesText, card.effectText, card.flavorText].filter(Boolean).join('\n\n');
  const sourceLink=document.getElementById('lightboxSource');
  sourceLink.href=card.sourceUrl || 'https://openrift.app';
  sourceLink.classList.toggle('hidden', !card.sourceUrl);
  document.getElementById('lightboxFinish').textContent=card.specialFinish ? `Exemplare: ${card.finishes.join(', ')}` : 'Normal Kopien';
  for(const [id,field] of [['lbNormalMinus','normal'],['lbNormalPlus','normal'],['lbFoilMinus','foil'],['lbFoilPlus','foil']]) document.getElementById(id).disabled=!canCount(card,field);
  document.getElementById('lightboxPlaysetText').textContent = `Gesamt: ${total} / ${target}`;

  const imgEl = document.getElementById('lightboxImg');
  delete imgEl.dataset.fallbackApplied;
  imgEl.onerror = () => handleCardImageError(imgEl, card.id);
  imgEl.src = getCardPrimaryImageUrl(card);

  document.getElementById('lightboxFoilGlare').classList.toggle('hidden', foil === 0);
  document.getElementById('lightboxImgWrapper').classList.toggle('foil-active-border', foil > 0);

  document.getElementById('lbNormalVal').textContent = normal;
  document.getElementById('lbFoilVal').textContent = foil;
}

function closeLightbox() {
  state.activeLightboxCardId = null;
  document.getElementById('lightboxModal').classList.add('hidden');
}

function openAddModal(prefillName = '') {
  for(const id of ['modalNumber','modalName','modalSet','modalDomain','modalType','modalRarity','modalNormal','modalFoil']) document.getElementById(id).disabled=false;
  document.getElementById('modalTitle').textContent = 'Neue Riftbound-Karte hinzufügen';
  document.getElementById('modalCardId').value = '';
  const nextNum = `OGN-${String(state.cards.length + 1).padStart(3, '0')}`;
  document.getElementById('modalNumber').value = nextNum;
  document.getElementById('modalName').value = prefillName;
  document.getElementById('modalSet').value = 'OGN';
  document.getElementById('modalDomain').value = 'Fury';
  document.getElementById('modalType').value = 'Unit';
  document.getElementById('modalRarity').value = 'Common';
  document.getElementById('modalImageUrl').value = '';
  document.getElementById('modalNormal').value = 1;
  document.getElementById('modalFoil').value = 0;
  document.getElementById('cardModal').classList.remove('hidden');
  document.getElementById('modalName').focus();
}

function openEditModal(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  for(const id of ['modalNumber','modalName','modalSet','modalDomain','modalType','modalRarity']) document.getElementById(id).disabled=card.source==='OpenRift';
  document.getElementById('modalNormal').disabled=!canCount(card,'normal');
  document.getElementById('modalFoil').disabled=!canCount(card,'foil');
  document.getElementById('modalTitle').textContent = 'Karte & Bild bearbeiten';
  document.getElementById('modalCardId').value = card.id;
  document.getElementById('modalNumber').value = card.number;
  document.getElementById('modalName').value = card.name;
  document.getElementById('modalSet').value = card.set || 'OGN';
  document.getElementById('modalDomain').value = card.domain || 'Fury';
  document.getElementById('modalType').value = card.type || 'Unit';
  document.getElementById('modalRarity').value = card.rarity || 'Common';
  document.getElementById('modalImageUrl').value = card.imageUrl || '';
  document.getElementById('modalNormal').value = card.normal || 0;
  document.getElementById('modalFoil').value = card.foil || 0;
  document.getElementById('cardModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('cardModal').classList.add('hidden');
}

window.adjustCardCount = adjustCardCount;
window.updateCardCount = updateCardCount;
window.openEditModal = openEditModal;
window.openLightbox = openLightbox;
window.handleCardImageError = handleCardImageError;

document.addEventListener('DOMContentLoaded', async () => {
  await loadCollection();
  refreshCatalogControls();
  renderAll();

  document.getElementById('btnCloseLightbox').addEventListener('click', closeLightbox);
  document.getElementById('lightboxModal').addEventListener('click', e => {
    if (e.target.id === 'lightboxModal') closeLightbox();
  });
  document.getElementById('lbNormalMinus').addEventListener('click', () => {
    if (state.activeLightboxCardId) adjustCardCount(state.activeLightboxCardId, 'normal', -1);
  });
  document.getElementById('lbNormalPlus').addEventListener('click', () => {
    if (state.activeLightboxCardId) adjustCardCount(state.activeLightboxCardId, 'normal', 1);
  });
  document.getElementById('lbFoilMinus').addEventListener('click', () => {
    if (state.activeLightboxCardId) adjustCardCount(state.activeLightboxCardId, 'foil', -1);
  });
  document.getElementById('lbFoilPlus').addEventListener('click', () => {
    if (state.activeLightboxCardId) adjustCardCount(state.activeLightboxCardId, 'foil', 1);
  });

  document.getElementById('modalImageFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('modalImageUrl').value = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('btnClearModalImage').addEventListener('click', () => {
    document.getElementById('modalImageUrl').value = '';
    document.getElementById('modalImageFile').value = '';
  });

  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', e => {
    state.search = e.target.value;
    renderListAndGrid();
  });

  document.getElementById('btnClearSearch').addEventListener('click', () => {
    state.search = '';
    searchInput.value = '';
    renderListAndGrid();
  });

  document.querySelectorAll('.ownership-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ownership = btn.dataset.ownership;
      document.querySelectorAll('.ownership-tab').forEach(b => {
        const active = b.dataset.ownership === state.ownership;
        b.className = active
          ? 'ownership-tab px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white cursor-pointer transition'
          : 'ownership-tab px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer transition';
      });
      renderListAndGrid();
    });
  });

  document.querySelectorAll('.domain-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.domain = btn.dataset.domain;
      document.querySelectorAll('.domain-pill').forEach(b => {
        const active = b.dataset.domain === state.domain;
        b.className = active
          ? 'domain-pill px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-600 text-white cursor-pointer'
          : 'domain-pill px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer';
      });
      renderListAndGrid();
    });
  });

  document.getElementById('filterSet').addEventListener('change', e => {
    state.set = e.target.value;
    renderListAndGrid();
  });
  document.getElementById('filterType').addEventListener('change', e => {
    state.type = e.target.value;
    renderListAndGrid();
  });
  document.getElementById('filterRarity').addEventListener('change', e => {
    state.rarity = e.target.value;
    renderListAndGrid();
  });
  document.getElementById('sortSelect').addEventListener('change', e => {
    state.sort = e.target.value;
    renderListAndGrid();
  });

  const viewBtnTable = document.getElementById('viewBtnTable');
  const viewBtnGrid = document.getElementById('viewBtnGrid');
  viewBtnTable.addEventListener('click', () => {
    state.viewMode = 'table';
    viewBtnTable.className = 'px-2.5 py-1 rounded text-xs font-semibold bg-indigo-600 text-white shadow-sm cursor-pointer';
    viewBtnGrid.className = 'px-2.5 py-1 rounded text-xs font-medium text-slate-400 hover:text-white cursor-pointer';
    renderListAndGrid();
  });
  viewBtnGrid.addEventListener('click', () => {
    state.viewMode = 'grid';
    viewBtnGrid.className = 'px-2.5 py-1 rounded text-xs font-semibold bg-indigo-600 text-white shadow-sm cursor-pointer';
    viewBtnTable.className = 'px-2.5 py-1 rounded text-xs font-medium text-slate-400 hover:text-white cursor-pointer';
    renderListAndGrid();
  });

  function resetAllFilters() {
    state.search = '';
    state.ownership = 'all';
    state.domain = 'all';
    state.set = 'all';
    state.type = 'all';
    state.rarity = 'all';
    document.getElementById('searchInput').value = '';
    document.getElementById('filterSet').value = 'all';
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterRarity').value = 'all';
    document.querySelector('[data-ownership="all"]').click();
    document.querySelector('[data-domain="all"]').click();
    renderListAndGrid();
  }
  document.getElementById('btnResetFilters').addEventListener('click', resetAllFilters);
  document.getElementById('btnEmptyReset').addEventListener('click', resetAllFilters);

  document.getElementById('quickAddForm').addEventListener('submit', e => {
    e.preventDefault();
    const rawInput = document.getElementById('quickCardInput').value.trim();
    if (!rawInput) return;
    const addNormal = Math.max(0, parseInt(document.getElementById('quickNormalDelta').value, 10) || 0);
    const addFoil = Math.max(0, parseInt(document.getElementById('quickFoilDelta').value, 10) || 0);

    const explicitId=rawInput.includes(' | ') ? rawInput.split(' | ').at(-1) : null;
    let searchKey = rawInput;
    if (rawInput.includes('–')) {
      searchKey = rawInput.split('–')[0].trim();
    }

    const lowerKey = searchKey.toLowerCase();
    let matches = explicitId ? state.cards.filter(c=>c.id===explicitId) : state.cards.filter(
      c => c.number.toLowerCase() === lowerKey || c.name.toLowerCase() === lowerKey
    );
    if (!matches.length && !explicitId) matches=state.cards.filter(c=>c.name.toLowerCase().includes(lowerKey) || c.number.toLowerCase().includes(lowerKey));
    const found = matches.length === 1 ? matches[0] : null;

    const feedbackEl = document.getElementById('quickAddFeedback');
    feedbackEl.classList.remove('hidden');

    if (matches.length > 1) {
      feedbackEl.textContent='Mehrere Varianten gefunden. Bitte eine vollständige Variante aus den Vorschlägen auswählen.';
      return;
    }
    if (found && ((!canCount(found,'normal') && addNormal) || (!canCount(found,'foil') && addFoil))) {
      feedbackEl.textContent='Diese Ausführung ist im Katalog für das gewählte Finish nicht verfügbar.';
      return;
    }
    if (found) {
      found.normal = Math.min(999, (found.normal || 0) + addNormal);
      found.foil = Math.min(999, (found.foil || 0) + addFoil);
      saveCollection();
      renderAll();
      feedbackEl.textContent = `✔ Gebucht: ${found.number} ${found.name} (+${addNormal} Normal, +${addFoil} Foil ✨ → Jetzt: ${found.normal} Normal / ${found.foil} Foil)`;
    } else {
      const isCode = /^[A-Z]{3}-\d+/i.test(rawInput);
      const newNum = isCode ? rawInput.toUpperCase() : `OGN-${String(state.cards.length + 1).padStart(3, '0')}`;
      const newCard = {
        id: `custom-${crypto.randomUUID()}`,
        number: newNum,
        name: rawInput,
        set: 'OGN',
        domain: 'Neutral',
        type: 'Unit',
        rarity: 'Common',
        normal: Math.min(999,addNormal),
        foil: Math.min(999,addFoil)
      };
      state.cards.unshift(newCard);
      saveCollection();
      renderAll();
      feedbackEl.textContent = `✨ Neue Karte angelegt & gebucht: "${newCard.name}" (${addNormal} Normal / ${addFoil} Foil)`;
    }

    document.getElementById('quickCardInput').value = '';
    document.getElementById('quickCardInput').focus();
  });

  document.getElementById('btnOpenAddModal').addEventListener('click', () => openAddModal());
  document.getElementById('btnEmptyAddCard').addEventListener('click', () => openAddModal(state.search));
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeModal);

  document.getElementById('modalCardForm').addEventListener('submit', e => {
    e.preventDefault();
    const existingId = document.getElementById('modalCardId').value;
    const number = document.getElementById('modalNumber').value.trim();
    const name = document.getElementById('modalName').value.trim();
    const set = document.getElementById('modalSet').value;
    const domain = document.getElementById('modalDomain').value;
    const type = document.getElementById('modalType').value;
    const rarity = document.getElementById('modalRarity').value;
    const catalogCard = (window.DEFAULT_RIFTBOUND_CARDS || []).find(c => c.id === existingId);
    const imageUrl = document.getElementById('modalImageUrl').value.trim() || catalogCard?.imageUrl || '';
    const normal = Math.max(0, parseInt(document.getElementById('modalNormal').value, 10) || 0);
    const foil = Math.max(0, parseInt(document.getElementById('modalFoil').value, 10) || 0);

    if (existingId) {
      const idx = state.cards.findIndex(c => c.id === existingId);
      if (idx !== -1) {
        state.cards[idx] = { ...state.cards[idx], number, name, set, domain, type, rarity, imageUrl, normal, foil };
      }
    } else {
      state.cards.unshift({
        id: `custom-${crypto.randomUUID()}`,
        number,
        name,
        set,
        domain,
        type,
        rarity,
        imageUrl,
        normal,
        foil
      });
    }

    refreshCatalogControls();
    saveCollection();
    closeModal();
    renderAll();
  });

  document.getElementById('btnExportJSON').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(window.CollectionModel.snapshot(state.cards, window.DEFAULT_RIFTBOUND_CARDS || []), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riftbound-sammlung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('inputImportJSON').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        const items=Array.isArray(imported) ? imported : imported.schemaVersion===3 ? imported.items : null;
        window.CollectionModel.validateItems(items);
        const restored=window.CollectionModel.merge(window.DEFAULT_RIFTBOUND_CARDS || [], items);
        if (!confirm('Backup laden und den aktuellen Bestand ersetzen?')) return;
        state.cards=restored;
        persistenceEnabled=true;
        refreshCatalogControls();
        saveCollection();
        renderAll();
      } catch (err) {
        alert('Ungültiges Backup: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btnExportCSV').addEventListener('click', () => {
    const header = ['Nummer', 'Name', 'Set', 'Domain', 'Typ', 'Seltenheit', 'Normal_oder_Sonderfinish_Kopien', 'Foil_Kopien', 'Gesamt', 'Varianten_ID', 'Variante', 'Finishes'];
    const rows = state.cards.map(c => [
      `"${(c.number || '').replace(/"/g, '""')}"`,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.set || '').replace(/"/g, '""')}"`,
      `"${cardDomains(c).join(' / ').replace(/"/g, '""')}"`,
      `"${(c.type || '').replace(/"/g, '""')}"`,
      `"${(c.rarity || '').replace(/"/g, '""')}"`,
      c.normal || 0,
      c.foil || 0,
      (c.normal || 0) + (c.foil || 0),
      c.id,
      `"${(c.variant || '').replace(/"/g, '""')}"`,
      (c.finishes || []).join(',')
    ]);
    const csvContent = [header.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riftbound-sammlung-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
});
