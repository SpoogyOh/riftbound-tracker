const STORAGE_KEY_V2 = 'riftbound_card_tracker_v2';
const STORAGE_KEY_V1 = 'riftbound_card_tracker_v1';

const DOMAIN_META = {
  Fury:    { label: 'Fury',    bg1: '#7f1d1d', bg2: '#dc2626', accent: '#fca5a5' },
  Calm:    { label: 'Calm',    bg1: '#064e3b', bg2: '#10b981', accent: '#6ee7b7' },
  Mind:    { label: 'Mind',    bg1: '#1e3a8a', bg2: '#3b82f6', accent: '#93c5fd' },
  Body:    { label: 'Body',    bg1: '#78350f', bg2: '#f59e0b', accent: '#fde68a' },
  Chaos:   { label: 'Chaos',   bg1: '#4c1d95', bg2: '#9333ea', accent: '#d8b4fe' },
  Order:   { label: 'Order',   bg1: '#7c2d12', bg2: '#ea580c', accent: '#fdba74' },
  Neutral: { label: 'Neutral', bg1: '#1e293b', bg2: '#475569', accent: '#cbd5e1' }
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
  viewMode: 'grid',
  activeCardId: null
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
let cloud = null;
let liveCatalog = null;
let modalCloudToken;
function currentCatalog() { return liveCatalog || window.DEFAULT_RIFTBOUND_CARDS || []; }
function onlineMode() { return !!cloud && cloud.mode !== 'local'; }
function setStorageStatus(message, error = false) {
  const el = document.getElementById('storageStatus');
  el.textContent = message;
  el.classList.toggle('text-red-700', error);
}
async function loadCollection(isCurrent = () => true) {
  try {
    const saved = await window.CollectionStorage.load();
    if (!isCurrent()) return;
    state.cards = window.CollectionModel.merge(window.DEFAULT_RIFTBOUND_CARDS || [], saved);
    persistenceEnabled = true;
    const review = state.cards.filter(c => c.migrationReview).length;
    setStorageStatus(review ? `${review} earlier entries kept for review.` : 'Collection loaded.');
  } catch (error) {
    if (!isCurrent()) return;
    persistenceEnabled = false;
    state.cards = (window.DEFAULT_RIFTBOUND_CARDS || []).map(c => ({...c}));
    setStorageStatus('Couldn’t read the saved collection. Download a backup and reload the page; saving is locked.', true);
  }
}
function saveCollection() {
  if (!persistenceEnabled || onlineMode()) return Promise.resolve(false);
  const record = window.CollectionModel.snapshot(state.cards, currentCatalog());
  setStorageStatus('Saving…');
  return window.CollectionStorage.save(record).then(mode => {
    if (!onlineMode()) setStorageStatus(`Saved · ${mode}`);
    return true;
  }).catch(() => {
    if (!onlineMode()) setStorageStatus('Saving failed. Download a JSON backup now.', true);
    return false;
  });
}
function cardDomains(card) { return card.domains?.length ? card.domains : [card.domain || 'Neutral']; }
function cardLabel(card) {
  return card.name + (card.variant ? ` [${card.variant}]` : '') + (card.preview ? ' [Preview]' : '') + (card.migrationReview ? ' [Review match]' : '') + (card.active === false ? ' [Archived]' : '');
}
function canCount(card, field) {
  if (cloud?.locked) return false;
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
    el.innerHTML=(id.startsWith('filter') ? '<option value="all">All</option>' : '') + values.sort().map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if ([...el.options].some(o=>o.value===selected)) el.value=selected;
  }
  const meta=window.OPENRIFT_CATALOG_META;
  if (liveCatalog) document.getElementById('catalogStatus').textContent=`${liveCatalog.length.toLocaleString('en-US')} variants · Supabase`;
  else if(meta) document.getElementById('catalogStatus').textContent=`${meta.cardCount.toLocaleString('en-US')} variants · ${meta.printingCount.toLocaleString('en-US')} printings · updated ${meta.importedAt.slice(0,10)}`;
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
  if (onlineMode()) return cloud.change(cardId, { [field]: cleanVal });
  state.cards[idx][field] = cleanVal;
  saveCollection();
  renderAll();
  if (state.activeCardId === cardId) {
    syncCardPanel(cardId);
  }
}

function adjustCardCount(cardId, field, delta) {
  const idx = state.cards.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  if (!canCount(state.cards[idx], field)) return;
  if (onlineMode()) {
    if (state.cards[idx][field] + delta < 0 || state.cards[idx][field] + delta > 999) return;
    return cloud.change(cardId, { finish: field, delta });
  }
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
    dots += `<span class="inline-block w-2 h-2 rounded-full ${filled ? 'bg-ink' : 'border border-line'}"></span>`;
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

  document.getElementById('statTotalCopies').textContent = grandTotal.toLocaleString('en-US');
  document.getElementById('statNormalBreakdown').textContent = `${totalNormal.toLocaleString('en-US')} normal`;
  document.getElementById('statFoilCopies').textContent = totalFoil.toLocaleString('en-US');
  document.getElementById('statFoilRatio').textContent = `${foilPct}%`;
  document.getElementById('statUniqueOwned').textContent = uniqueOwned.toLocaleString('en-US');
  document.getElementById('statTotalCatalog').textContent = catalogSize.toLocaleString('en-US');
  document.getElementById('statUniquePercent').textContent = `${uniquePct}%`;
  document.getElementById('statProgressBar').style.width = `${uniquePct}%`;
  document.getElementById('statPlaysets').textContent = playsets.toLocaleString('en-US');

  const dl = document.getElementById('catalogAutocomplete');
  dl.innerHTML = state.cards
    .map(c => `<option value="${escapeHtml(c.number)} – ${escapeHtml(cardLabel(c))} | ${escapeHtml(c.id)}"></option>`)
    .join('');
}

function renderListAndGrid() {
  const filtered = getFilteredCards();
  const totalCatalog = state.cards.length;
  document.getElementById('resultsCounter').textContent =
    `${filtered.length.toLocaleString('en-US')} of ${totalCatalog.toLocaleString('en-US')} cards`;

  const activeFilters = ['ownership', 'domain', 'set', 'type', 'rarity'].filter(key => state[key] !== 'all').length;
  const hasFilters = state.search !== '' || activeFilters > 0;
  // The sidebar is hidden below 1024px, so the Filters button shows how many apply.
  document.getElementById('filterCount').textContent = activeFilters ? `[${activeFilters}]` : '';

  document.getElementById('btnResetFilters').classList.toggle('hidden', !hasFilters);
  document.getElementById('btnClearSearch').classList.toggle('hidden', state.search === '');

  const emptyEl = document.getElementById('emptyState');
  const tableContainer = document.getElementById('tableContainer');
  const gridContainer = document.getElementById('gridContainer');

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
    tableContainer.classList.add('hidden');
    gridContainer.classList.add('hidden');
    if (state.activeCardId) syncCardPanel(state.activeCardId);
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
  // Keep the open card marked and its prev/next buttons current after filtering.
  if (state.activeCardId) syncCardPanel(state.activeCardId);
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
      <tr data-card-id="${escapeHtml(card.id)}" class="group hover:bg-soft/40 transition">
        <td class="py-2 pr-3">
          <div class="flex items-center gap-3">
            <button
              type="button"
              onclick="openCardPanel('${escapeHtml(card.id)}')"
              class="relative w-10 h-14 rounded overflow-hidden bg-soft shrink-0 cursor-pointer group-hover:scale-105 transition-transform ${foil > 0 ? 'foil-active-border' : ''}"
              title="Enlarge card image"
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
                <span class="text-xs text-muted tabular-nums">${escapeHtml(card.number)}</span>
                ${foil > 0 ? `<span class="caps text-[11px] px-1.5 rounded-[3px] border border-line foil-badge text-foil">${foil}× Foil</span>` : ''}
              </div>
              <div class="caps text-sm truncate">${card.sourceUrl ? `<a href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="hover:underline">${escapeHtml(cardLabel(card))} ↗</a>` : escapeHtml(cardLabel(card))}</div>
            </div>
          </div>
        </td>
        <td class="py-2 px-3 whitespace-nowrap">
          <span class="inline-flex items-center gap-1.5 text-xs">
            <span class="dot" style="background:${dMeta.bg2}"></span>
            <span>${escapeHtml(cardDomains(card).join(' / '))}</span>
          </span>
        </td>
        <td class="py-2 px-3 whitespace-nowrap">
          <div class="flex items-center gap-1.5 text-xs">
            <span>${escapeHtml(card.type)}</span>
            <span class="text-muted">·</span>
            <span class="text-muted">${escapeHtml(card.rarity)}</span>
          </div>
        </td>
        <td class="py-2 px-3">
          <div class="flex items-center justify-center gap-1">
            <button type="button" ${!canCount(card,'normal') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'normal', -1)" class="step">−</button>
            <input
              type="number"
              min="0"
              max="999"
              value="${normal}" ${!canCount(card,'normal') ? 'disabled' : ''}
              onchange="updateCardCount('${escapeHtml(card.id)}', 'normal', this.value)"
              class="count"
            />
            <button type="button" ${!canCount(card,'normal') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'normal', 1)" class="step">＋</button>
          </div>
        </td>
        <td class="py-2 px-3">
          <div class="flex items-center justify-center gap-1">
            <button type="button" ${!canCount(card,'foil') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'foil', -1)" class="step text-foil">−</button>
            <input
              type="number"
              min="0"
              max="999"
              value="${foil}" ${!canCount(card,'foil') ? 'disabled' : ''}
              onchange="updateCardCount('${escapeHtml(card.id)}', 'foil', this.value)"
              class="count text-foil ${foil > 0 ? 'foil-badge' : ''}"
            />
            <button type="button" ${!canCount(card,'foil') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'foil', 1)" class="step text-foil">＋</button>
          </div>
        </td>
        <td class="py-2 px-3 text-center whitespace-nowrap">
          <div class="inline-flex flex-col items-center gap-1">
            <span class="text-xs font-bold tabular-nums ${total >= target ? 'text-ink' : 'text-muted'}">
              ${total} / ${target}
            </span>
            <div class="flex items-center gap-1">
              ${renderPlaysetDots(total, target)}
            </div>
          </div>
        </td>
        <td class="py-2 pl-3 text-right whitespace-nowrap">
          <button type="button" onclick="openEditModal('${escapeHtml(card.id)}')" class="step" title="Edit card &amp; image">
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
      <div data-card-id="${escapeHtml(card.id)}" class="group border-r border-b border-line p-3 sm:p-4 flex flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="caps text-[15px] leading-tight truncate" title="${escapeHtml(cardLabel(card))}">
              ${card.sourceUrl ? `<a href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="hover:underline">${escapeHtml(cardLabel(card))} ↗</a>` : escapeHtml(cardLabel(card))}
            </h3>
            <p class="text-xs mt-1 flex items-center gap-1.5"><span class="dot" style="background:${dMeta.bg2}"></span>${escapeHtml(cardDomains(card).join(' / '))}</p>
            <p class="text-xs text-muted">${escapeHtml(card.number)} · ${escapeHtml(card.type)} · ${escapeHtml(card.rarity)}</p>
          </div>
          <button
            type="button"
            onclick="openEditModal('${escapeHtml(card.id)}')"
            class="shrink-0 text-xs text-muted hover:text-ink cursor-pointer"
            title="Edit card &amp; image"
          >
            ✎
          </button>
        </div>

        <div class="relative w-full card-aspect rounded-md overflow-hidden bg-soft ${foil > 0 ? 'foil-active-border' : ''}">
          <img
            src="${escapeHtml(imgUrl)}"
            alt="${escapeHtml(cardLabel(card))}"
            loading="lazy"
            onclick="openCardPanel('${escapeHtml(card.id)}')"
            onerror="handleCardImageError(this, '${escapeHtml(card.id)}')"
            class="w-full h-full object-cover cursor-pointer group-hover:scale-103 transition-transform duration-300 ${total === 0 ? 'card-unowned-img' : ''}"
          />
          ${foil > 0 ? '<div class="absolute inset-0 foil-image-glare"></div>' : ''}
        </div>

        <div class="mt-auto space-y-1.5">
          <div class="hidden sm:flex items-center justify-between gap-2 pl-2.5 pr-1 py-1 border border-line rounded-[3px]">
            <span class="caps text-xs truncate">${card.specialFinish ? escapeHtml(card.finishes.join(' / ')) : 'Normal'}</span>
            <div class="flex items-center gap-1">
              <button type="button" ${!canCount(card,'normal') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'normal', -1)" class="step">−</button>
              <input
                type="number"
                min="0"
                max="999"
                value="${normal}" ${!canCount(card,'normal') ? 'disabled' : ''}
                onchange="updateCardCount('${escapeHtml(card.id)}', 'normal', this.value)"
                class="count count-sm"
              />
              <button type="button" ${!canCount(card,'normal') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'normal', 1)" class="step">＋</button>
            </div>
          </div>

          <div class="hidden sm:flex items-center justify-between gap-2 pl-2.5 pr-1 py-1 border border-line rounded-[3px]">
            <span class="caps text-xs text-foil">Foil</span>
            <div class="flex items-center gap-1">
              <button type="button" ${!canCount(card,'foil') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'foil', -1)" class="step text-foil">−</button>
              <input
                type="number"
                min="0"
                max="999"
                value="${foil}" ${!canCount(card,'foil') ? 'disabled' : ''}
                onchange="updateCardCount('${escapeHtml(card.id)}', 'foil', this.value)"
                class="count count-sm text-foil ${foil > 0 ? 'foil-badge' : ''}"
              />
              <button type="button" ${!canCount(card,'foil') ? 'disabled' : ''} onclick="adjustCardCount('${escapeHtml(card.id)}', 'foil', 1)" class="step text-foil">＋</button>
            </div>
          </div>

          <div class="flex items-center justify-between pt-1 text-xs">
            <span class="text-muted">Owned <strong class="text-ink tabular-nums">${total} / ${target}</strong>${foil > 0 ? `<span class="sm:hidden text-foil"> · ${foil} foil</span>` : ''}</span>
            <div class="flex items-center gap-1">
              ${renderPlaysetDots(total, target)}
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
  for (const id of ['btnOpenAddModal', 'btnEmptyAddCard', 'inputImportJSON']) {
    document.getElementById(id).disabled = onlineMode();
  }
  document.querySelector('#quickAddForm button[type="submit"]').disabled = !!cloud?.locked;
  document.querySelector('#modalCardForm button[type="submit"]').disabled = !!cloud?.locked;
  document.getElementById('btnCloudRefresh').disabled = !!cloud?.busy;
}

function openCardPanel(cardId) {
  state.activeCardId = cardId;
  syncCardPanel(cardId);
  document.getElementById('cardPanel').hidden = false;
  document.body.classList.add('panel-open');
}

function visibleResultFor(cardId) {
  const container = document.getElementById(state.viewMode === 'grid' ? 'gridContainer' : 'cardTableBody');
  return [...container.children].find(el => el.dataset.cardId === cardId);
}

// Browse in the order the results are shown; does nothing at either end.
function stepCardPanel(delta) {
  const cards = getFilteredCards();
  const index = cards.findIndex(c => c.id === state.activeCardId);
  const next = index === -1 ? null : cards[index + delta];
  if (!next) return;
  openCardPanel(next.id);
  visibleResultFor(next.id)?.scrollIntoView({ block: 'nearest' });
}

function syncCardPanel(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  const normal = card.normal || 0;
  const foil = card.foil || 0;
  const total = normal + foil;
  const target = getPlaysetTarget(card);

  document.getElementById('panelNumber').textContent = card.number;
  document.getElementById('panelName').textContent = cardLabel(card);
  document.getElementById('panelMeta').textContent = `${cardDomains(card).join(' / ')} · ${card.type} · ${card.rarity}`;
  document.getElementById('panelRules').textContent = [card.rulesText, card.effectText, card.flavorText].filter(Boolean).join('\n\n');
  const sourceLink=document.getElementById('panelSource');
  sourceLink.href=card.sourceUrl || 'https://openrift.app';
  sourceLink.classList.toggle('hidden', !card.sourceUrl);
  document.getElementById('panelFinish').textContent=card.specialFinish ? card.finishes.join(' / ') : 'Normal';
  for(const [id,field] of [['panelNormalMinus','normal'],['panelNormalPlus','normal'],['panelFoilMinus','foil'],['panelFoilPlus','foil']]) document.getElementById(id).disabled=!canCount(card,field);
  document.getElementById('panelPlaysetText').textContent = `${total} / ${target}`;

  const imgEl = document.getElementById('panelImg');
  delete imgEl.dataset.fallbackApplied;
  imgEl.onerror = () => handleCardImageError(imgEl, card.id);
  imgEl.alt = cardLabel(card);
  imgEl.src = getCardPrimaryImageUrl(card);

  document.getElementById('panelFoilGlare').classList.toggle('hidden', foil === 0);
  document.getElementById('panelImgWrapper').classList.toggle('foil-active-border', foil > 0);

  document.getElementById('panelNormalVal').textContent = normal;
  document.getElementById('panelFoilVal').textContent = foil;

  const cards = getFilteredCards();
  const index = cards.findIndex(c => c.id === cardId);
  document.getElementById('btnPanelPrev').disabled = index <= 0;
  document.getElementById('btnPanelNext').disabled = index === -1 || index === cards.length - 1;
  document.querySelectorAll('[data-card-id].is-active').forEach(el => el.classList.remove('is-active'));
  visibleResultFor(cardId)?.classList.add('is-active');
}

function closeCardPanel() {
  state.activeCardId = null;
  document.getElementById('cardPanel').hidden = true;
  document.body.classList.remove('panel-open');
  document.querySelectorAll('[data-card-id].is-active').forEach(el => el.classList.remove('is-active'));
}

function openAddModal(prefillName = '') {
  if (onlineMode()) return;
  for(const id of ['modalNumber','modalName','modalSet','modalDomain','modalType','modalRarity','modalNormal','modalFoil']) document.getElementById(id).disabled=false;
  document.getElementById('modalTitle').textContent = 'New custom card';
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
  if (!card || cloud?.locked) return;
  for(const id of ['modalNumber','modalName','modalSet','modalDomain','modalType','modalRarity']) document.getElementById(id).disabled=card.source==='OpenRift';
  document.getElementById('modalNormal').disabled=!canCount(card,'normal');
  document.getElementById('modalFoil').disabled=!canCount(card,'foil');
  modalCloudToken = cloud?.editToken(cardId);
  document.getElementById('modalTitle').textContent = 'Edit card & image';
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
window.openCardPanel = openCardPanel;
window.handleCardImageError = handleCardImageError;

document.addEventListener('DOMContentLoaded', async () => {
  if (window.RiftboundCloud) {
    cloud = window.RiftboundCloud.start({
      status: setStorageStatus,
      clear() { liveCatalog = null; state.cards = []; closeModal(); closeCardPanel(); renderAll(); },
      show(cards, catalog) { liveCatalog = catalog; state.cards = cards; refreshCatalogControls(); },
      async local(isCurrent) { await loadCollection(isCurrent); if (isCurrent()) refreshCatalogControls(); },
      render: renderAll
    });
  }
  if (!cloud) { await loadCollection(); refreshCatalogControls(); }
  renderAll();

  document.getElementById('btnClosePanel').addEventListener('click', closeCardPanel);
  document.getElementById('btnPanelPrev').addEventListener('click', () => stepCardPanel(-1));
  document.getElementById('btnPanelNext').addEventListener('click', () => stepCardPanel(1));
  document.getElementById('btnPanelEdit').addEventListener('click', () => {
    if (state.activeCardId) openEditModal(state.activeCardId);
  });
  for (const [id, field, delta] of [['panelNormalMinus', 'normal', -1], ['panelNormalPlus', 'normal', 1], ['panelFoilMinus', 'foil', -1], ['panelFoilPlus', 'foil', 1]]) {
    document.getElementById(id).addEventListener('click', () => {
      if (state.activeCardId) adjustCardCount(state.activeCardId, field, delta);
    });
  }
  document.addEventListener('keydown', e => {
    if (!state.activeCardId || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    // Menus and the edit dialog handle their own keys while open.
    if (document.querySelector(':popover-open') || !document.getElementById('cardModal').classList.contains('hidden')) return;
    if (e.key === 'Escape') closeCardPanel();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      stepCardPanel(e.key === 'ArrowRight' ? 1 : -1);
    }
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

  const accountMenu = document.getElementById('accountMenu');
  accountMenu.addEventListener('beforetoggle', e => {
    if (e.newState !== 'open') return;
    // Popovers open in the top layer; align this one below its trigger.
    const r = document.getElementById('btnAccountMenu').getBoundingClientRect();
    accountMenu.style.top = `${r.bottom + 8}px`;
    accountMenu.style.right = `${Math.max(8, document.documentElement.clientWidth - r.right)}px`;
  });
  accountMenu.addEventListener('click', e => {
    if (e.target.closest('[data-close-menu]')) accountMenu.hidePopover?.();
  });
  document.getElementById('inputImportJSON').addEventListener('change', () => accountMenu.hidePopover?.());

  const searchInput = document.getElementById('searchInput');
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    searchInput.focus();
  });
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
        b.setAttribute('aria-pressed', String(active));
      });
      renderListAndGrid();
    });
  });

  document.querySelectorAll('.domain-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.domain = btn.dataset.domain;
      document.querySelectorAll('.domain-pill').forEach(b => {
        const active = b.dataset.domain === state.domain;
        b.setAttribute('aria-pressed', String(active));
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
    viewBtnTable.setAttribute('aria-pressed', 'true');
    viewBtnGrid.setAttribute('aria-pressed', 'false');
    renderListAndGrid();
  });
  viewBtnGrid.addEventListener('click', () => {
    state.viewMode = 'grid';
    viewBtnGrid.setAttribute('aria-pressed', 'true');
    viewBtnTable.setAttribute('aria-pressed', 'false');
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
    // Update the pressed states directly so the reset renders once, not three times.
    document.querySelectorAll('.ownership-tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ownership === 'all')));
    document.querySelectorAll('.domain-pill').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.domain === 'all')));
    renderListAndGrid();
  }
  document.getElementById('btnResetFilters').addEventListener('click', resetAllFilters);
  document.getElementById('btnEmptyReset').addEventListener('click', resetAllFilters);

  document.getElementById('quickAddForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (cloud?.locked) return;
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
    if (onlineMode()) {
      if (!found) { feedbackEl.textContent = 'Bitte eine Variante aus dem Online-Katalog auswählen. Eigene Karten bleiben lokal.'; return; }
      // Both finish deltas form one revision-checked edit, so quick entry is all-or-nothing.
      const ok = await cloud.change(found.id, { normal: Math.min(999, found.normal + addNormal), foil: Math.min(999, found.foil + addFoil) });
      feedbackEl.textContent = ok ? '✔ Online gebucht.' : 'Nicht bestätigt. Bitte Speicherstatus und aktuellen Bestand prüfen.';
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

  document.getElementById('modalCardForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (cloud?.locked) return;
    const existingId = document.getElementById('modalCardId').value;
    const number = document.getElementById('modalNumber').value.trim();
    const name = document.getElementById('modalName').value.trim();
    const set = document.getElementById('modalSet').value;
    const domain = document.getElementById('modalDomain').value;
    const type = document.getElementById('modalType').value;
    const rarity = document.getElementById('modalRarity').value;
    const catalogCard = currentCatalog().find(c => c.id === existingId);
    const imageUrl = document.getElementById('modalImageUrl').value.trim() || catalogCard?.imageUrl || '';
    const normal = Math.max(0, parseInt(document.getElementById('modalNormal').value, 10) || 0);
    const foil = Math.max(0, parseInt(document.getElementById('modalFoil').value, 10) || 0);

    if (onlineMode()) {
      if (!catalogCard) return;
      const ok = await cloud.change(existingId, { normal, foil, image_override: imageUrl === catalogCard.imageUrl ? null : imageUrl }, modalCloudToken);
      if (ok) closeModal();
      return;
    }
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
    const blob = new Blob([JSON.stringify(window.CollectionModel.snapshot(state.cards, currentCatalog()), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riftbound-sammlung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('inputImportJSON').addEventListener('change', e => {
    if (onlineMode()) return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        if (onlineMode()) return;
        const imported = JSON.parse(ev.target.result);
        const items=Array.isArray(imported) ? imported : imported.schemaVersion===3 ? imported.items : null;
        window.CollectionModel.validateItems(items);
        const restored=window.CollectionModel.merge(window.DEFAULT_RIFTBOUND_CARDS || [], items);
        if (!confirm('Restore this backup and replace your current collection?')) return;
        state.cards=restored;
        persistenceEnabled=true;
        refreshCatalogControls();
        saveCollection();
        renderAll();
      } catch (err) {
        alert('Invalid backup: ' + err.message);
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
