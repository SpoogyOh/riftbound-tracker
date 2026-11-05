// @ts-nocheck -- untyped interface code; it moves to typed modules in a later step.
import { getPlaysetKey, getPlaysetTarget, summarizePlaysets } from './playsets.js';
import { DOMAIN_ICONS, TYPE_ICONS, RARITY_ICONS, FALLBACK_ICON } from './icons.js';
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

const RARITY_ORDER = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Showcase: 5
};

const state = {
  cards: [],
  playsets: new Map(),
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
  const tIcon = TYPE_ICONS[card.type] || FALLBACK_ICON;
  const safeNumber = String(card.number || 'OGN').replace(/[<>&"']/g, '');
  const safeName = String(card.name || 'Card').replace(/[<>&"']/g, '');
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
    <image x="97" y="104" width="56" height="56" href="${escapeHtml(tIcon)}"/>
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

let cloud = null;
let liveCatalog = null;
let modalCloudToken;
function currentCatalog() { return liveCatalog || []; }
function setStorageStatus(message, error = false) {
  const el = document.getElementById('storageStatus');
  el.textContent = message;
  el.classList.toggle('text-red-700', error);
}
function cardDomains(card) { return card.domains?.length ? card.domains : [card.domain || 'Neutral']; }
function renderIcon(src, type = false) {
  return src ? `<img src="${escapeHtml(src)}" width="16" height="16" alt="" aria-hidden="true" class="rb-icon${type ? ' rb-type-icon' : ''}" />` : '';
}
function renderDomains(card) {
  return cardDomains(card).map(domain => `<span class="rb-label">${renderIcon(DOMAIN_ICONS[domain])}${escapeHtml(domain)}</span>`).join('<span aria-hidden="true"> / </span>');
}
function renderType(card) {
  return `<span class="rb-label">${renderIcon(TYPE_ICONS[card.type], true)}${escapeHtml(card.type)}</span>`;
}
function renderRarity(card) {
  return `<span class="rb-label">${renderIcon(RARITY_ICONS[card.rarity])}${escapeHtml(card.rarity)}</span>`;
}
function cardLabel(card) {
  return card.name + (card.variant ? ` [${card.variant}]` : '') + (card.preview ? ' [Preview]' : '') + (card.active === false ? ' [Archived]' : '');
}
function canCount(card, field) {
  if (cloud?.locked) return false;
  return !card.finishes || (field === 'foil' ? card.finishes.includes('foil') : card.specialFinish || card.finishes.includes('normal'));
}
function refreshCatalogControls() {
  for (const [id, values] of [
    ['filterSet', [...new Set(state.cards.map(c=>c.set))]],
    ['filterType', [...new Set(state.cards.map(c=>c.type))]],
    ['filterRarity', [...new Set(state.cards.map(c=>c.rarity))]]
  ]) {
    const el=document.getElementById(id), selected=el.value;
    el.innerHTML='<option value="all">All</option>' + values.sort().map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if ([...el.options].some(o=>o.value===selected)) el.value=selected;
  }
  document.getElementById('catalogStatus').textContent = liveCatalog ? ` · ${liveCatalog.length.toLocaleString('en-US')} variants · Supabase` : '';
}

// JSON backups keep schema version 3: owned counts and image overrides of catalog variants.
function backupRecord() {
  const byId = new Map(currentCatalog().map(c => [c.id, c]));
  const items = state.cards.flatMap(c => {
    const base = byId.get(c.id);
    const imageOverride = base && c.imageUrl !== base.imageUrl ? c.imageUrl : undefined;
    if (!c.normal && !c.foil && !imageOverride) return [];
    return [{ id: c.id, source: 'OpenRift', sourcePrintingIds: c.sourcePrintingIds, name: c.name, number: c.number,
      normal: c.normal || 0, foil: c.foil || 0, imageOverride }];
  });
  return { schemaVersion: 3, savedAt: new Date().toISOString(), items };
}

function getPlaysetTotal(card) {
  return state.playsets.get(getPlaysetKey(card))?.total || 0;
}

function getPlaysetDescription(card) {
  return card.type === 'Rune' ? 'Normal and foil copies of this rune variant' : 'Normal and foil copies across all variants of this card';
}

function updateCardCount(cardId, field, newValue) {
  const idx = state.cards.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  if (!canCount(state.cards[idx], field)) return;
  const cleanVal = Math.max(0, Math.min(999, parseInt(newValue, 10) || 0));
  return cloud?.change(cardId, { [field]: cleanVal });
}

function adjustCardCount(cardId, field, delta) {
  const idx = state.cards.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  if (!canCount(state.cards[idx], field)) return;
  if (state.cards[idx][field] + delta < 0 || state.cards[idx][field] + delta > 999) return;
  return cloud?.change(cardId, { finish: field, delta });
}

function getFilteredCards() {
  const q = state.search.trim().toLowerCase();

  const filtered = state.cards.filter(card => {
    const total = (card.normal || 0) + (card.foil || 0);
    const target = getPlaysetTarget(card);
    const playsetTotal = getPlaysetTotal(card);

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
    if (state.ownership === 'incomplete' && playsetTotal >= target) return false;
    if (state.ownership === 'playset' && playsetTotal < target) return false;

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
  if (target === 10) return '';
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

  for (const c of state.cards) {
    const n = c.normal || 0;
    const f = c.foil || 0;
    const tot = n + f;
    totalNormal += n;
    totalFoil += f;
    if (tot > 0) uniqueOwned++;
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
  const playsets = [...state.playsets.values()].filter(p => p.total >= p.target).length;
  document.getElementById('statPlaysets').textContent = playsets.toLocaleString('en-US');
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
    emptyEl.classList.toggle('hidden', state.cards.length === 0);
    tableContainer.classList.add('hidden');
    gridContainer.classList.add('hidden');
    // Drop stale results too, e.g. the previous account's cards after signing out.
    gridContainer.innerHTML = '';
    document.getElementById('cardTableBody').innerHTML = '';
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
    const playsetTotal = getPlaysetTotal(card);
    const imgUrl = getCardPrimaryImageUrl(card);

    return `
      <tr data-card-id="${escapeHtml(card.id)}" class="group hover:bg-soft/40 transition">
        <td class="py-2 pr-3">
          <div class="flex items-center gap-3">
            <button
              type="button"
              onclick="openCardPanel('${escapeHtml(card.id)}')"
              class="relative w-10 h-14 rounded-[4px] overflow-hidden bg-soft shrink-0 cursor-pointer group-hover:scale-105 transition-transform ${foil > 0 ? 'foil-active-border' : ''}"
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
          <span class="rb-domains text-xs">
            ${renderDomains(card)}
          </span>
        </td>
        <td class="py-2 px-3 whitespace-nowrap">
          <div class="flex items-center gap-1.5 text-xs">
            ${renderType(card)}
            <span class="text-muted">·</span>
            ${renderRarity(card)}
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
          <div class="inline-flex flex-col items-center gap-1" title="${getPlaysetDescription(card)}">
            <span class="text-xs font-bold tabular-nums ${playsetTotal >= target ? 'text-ink' : 'text-muted'}">
              ${playsetTotal} / ${target}
            </span>
            <div class="flex items-center gap-1">
              ${renderPlaysetDots(playsetTotal, target)}
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
    const playsetTotal = getPlaysetTotal(card);
    const imgUrl = getCardPrimaryImageUrl(card);

    return `
      <div data-card-id="${escapeHtml(card.id)}" class="group border-r border-b border-line p-3 sm:p-4 flex flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="caps text-[15px] leading-tight truncate" title="${escapeHtml(cardLabel(card))}">
              ${card.sourceUrl ? `<a href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="hover:underline">${escapeHtml(cardLabel(card))} ↗</a>` : escapeHtml(cardLabel(card))}
            </h3>
            <p class="text-xs mt-1">${escapeHtml(card.number)}</p>
            <p class="text-xs text-muted flex flex-wrap items-center gap-1">${renderDomains(card)} · ${renderType(card)} · ${renderRarity(card)}</p>
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

          <div class="flex flex-wrap items-center justify-between gap-1 pt-1 text-xs" title="${getPlaysetDescription(card)}">
            <span class="text-muted">Playset <strong class="text-ink tabular-nums">${playsetTotal} / ${target}</strong>${foil > 0 ? `<span class="sm:hidden text-foil"> · ${foil} foil</span>` : ''}</span>
            <div class="flex items-center gap-1">
              ${renderPlaysetDots(playsetTotal, target)}
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
  const target = getPlaysetTarget(card);

  document.getElementById('panelNumber').textContent = card.number;
  document.getElementById('panelName').textContent = cardLabel(card);
  document.getElementById('panelMeta').innerHTML = `${renderDomains(card)} · ${renderType(card)} · ${renderRarity(card)}`;
  document.getElementById('panelRules').textContent = [card.rulesText, card.effectText, card.flavorText].filter(Boolean).join('\n\n');
  const sourceLink=document.getElementById('panelSource');
  sourceLink.href=card.sourceUrl || 'https://openrift.app';
  sourceLink.classList.toggle('hidden', !card.sourceUrl);
  document.getElementById('panelFinish').textContent=card.specialFinish ? card.finishes.join(' / ') : 'Normal';
  for(const [id,field] of [['panelNormalMinus','normal'],['panelNormalPlus','normal'],['panelFoilMinus','foil'],['panelFoilPlus','foil']]) document.getElementById(id).disabled=!canCount(card,field);
  document.getElementById('panelPlaysetText').textContent = `${getPlaysetTotal(card)} / ${target}`;
  const playsetLabel = document.getElementById('panelPlaysetLabel');
  playsetLabel.textContent = card.type === 'Rune' ? 'Playset · this variant' : 'Playset · all variants';
  playsetLabel.title = getPlaysetDescription(card);

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

// Capture: fast entry for a pile of cards. Enter adds one copy in the chosen finish;
// several matches need an explicit choice, and unknown input changes nothing.
const CAPTURE_SHOWN = 8;
const capture = { finish: 'normal', candidates: [], index: -1, log: [], nextId: 1 };

function captureMatches(raw) {
  const key = raw.trim().toLowerCase();
  if (!key) return [];
  const exact = state.cards.filter(c => c.number.toLowerCase() === key || c.name.toLowerCase() === key);
  return exact.length ? exact : state.cards.filter(c => c.name.toLowerCase().includes(key) || c.number.toLowerCase().includes(key));
}

function setCaptureMessage(text) {
  document.getElementById('captureMessage').textContent = text;
}

function renderCaptureCandidates() {
  const input = document.getElementById('captureInput');
  const list = document.getElementById('captureCandidates');
  const shown = capture.candidates.slice(0, CAPTURE_SHOWN);
  list.innerHTML = shown.map((card, i) => `
    <button type="button" id="capture-option-${i}" role="option" aria-selected="${i === capture.index}" data-index="${i}" class="candidate">
      <img src="${escapeHtml(getCardPrimaryImageUrl(card))}" alt="" loading="lazy" onerror="handleCardImageError(this, '${escapeHtml(card.id)}')" class="w-8 h-11 shrink-0 rounded-[2px] object-cover bg-soft" />
      <span class="min-w-0">
        <span class="caps text-sm block truncate">${escapeHtml(cardLabel(card))}</span>
        <span class="text-xs block">${escapeHtml(card.number)} · ${card.normal || 0} normal · ${card.foil || 0} foil</span>
      </span>
    </button>`).join('');
  if (capture.index >= 0) input.setAttribute('aria-activedescendant', `capture-option-${capture.index}`);
  else input.removeAttribute('aria-activedescendant');
}

function updateCaptureCandidates() {
  const raw = document.getElementById('captureInput').value;
  capture.candidates = captureMatches(raw);
  const count = capture.candidates.length;
  // A single match is the target; several matches wait for an explicit choice.
  capture.index = count === 1 ? 0 : -1;
  renderCaptureCandidates();
  if (!raw.trim()) setCaptureMessage('');
  else if (!count) setCaptureMessage('No card found.');
  else if (count === 1) setCaptureMessage('Enter adds this card.');
  else setCaptureMessage(`${count} cards match. Choose one with ↑ ↓ or a click.${count > CAPTURE_SHOWN ? ` Showing the first ${CAPTURE_SHOWN}; keep typing.` : ''}`);
}

function renderCaptureLog() {
  document.getElementById('captureCount').textContent = capture.log.length;
  document.getElementById('captureLog').innerHTML = capture.log.map(entry => `
    <li class="flex items-center justify-between gap-3 py-2">
      <span class="min-w-0">
        <span class="caps text-sm block truncate">${escapeHtml(entry.label)}</span>
        <span class="text-xs">${escapeHtml(entry.number)} · ${entry.finish === 'foil' ? 'Foil' : 'Normal'} +1</span>
      </span>
      <button type="button" data-undo="${entry.id}" class="caps text-xs underline cursor-pointer">Undo</button>
    </li>`).join('');
}

function setCaptureFinish(finish) {
  capture.finish = finish;
  document.getElementById('captureNormal').setAttribute('aria-pressed', String(finish === 'normal'));
  document.getElementById('captureFoil').setAttribute('aria-pressed', String(finish === 'foil'));
  document.getElementById('captureInput').focus();
}

async function addCaptured(card) {
  const finish = capture.finish;
  if (cloud?.locked) return setCaptureMessage('Still saving. Try again in a moment.');
  if (!canCount(card, finish)) return setCaptureMessage(`${cardLabel(card)} has no ${finish} version.`);
  if ((card[finish] || 0) >= 999) return setCaptureMessage(`${cardLabel(card)} already has 999 ${finish} copies.`);
  const label = cardLabel(card);
  // Clear first so the next card can be typed while an online save is pending.
  document.getElementById('captureInput').value = '';
  capture.candidates = [];
  capture.index = -1;
  renderCaptureCandidates();
  const ok = await adjustCardCount(card.id, finish, 1);
  if (ok !== true) return setCaptureMessage(`Not confirmed: ${label}. Check the save status and your counts.`);
  capture.log.unshift({ id: capture.nextId++, cardId: card.id, label, number: card.number, finish });
  renderCaptureLog();
  setCaptureMessage(`Added ${label} · ${finish}.`);
}

async function undoCaptured(entryId) {
  const entry = capture.log.find(e => e.id === entryId);
  if (!entry) return;
  if (cloud?.locked) return setCaptureMessage('Still saving. Try again in a moment.');
  const card = state.cards.find(c => c.id === entry.cardId);
  if (card && (card[entry.finish] || 0) > 0) {
    const ok = await adjustCardCount(entry.cardId, entry.finish, -1);
    if (ok !== true) return setCaptureMessage(`Undo not confirmed: ${entry.label}. Check the save status and your counts.`);
    setCaptureMessage(`Removed one ${entry.finish} ${entry.label}.`);
  } else {
    setCaptureMessage(`${entry.label} has no ${entry.finish} copies left to remove.`);
  }
  capture.log = capture.log.filter(e => e !== entry);
  renderCaptureLog();
}

function openCapture() {
  const dialog = document.getElementById('capturePanel');
  capture.log = [];
  capture.candidates = [];
  capture.index = -1;
  document.getElementById('captureInput').value = '';
  renderCaptureLog();
  renderCaptureCandidates();
  setCaptureMessage('');
  // The attribute fallback covers environments without <dialog> methods, such as jsdom.
  if (!dialog.open) dialog.showModal ? dialog.showModal() : dialog.setAttribute('open', '');
  document.getElementById('captureInput').focus();
}

function closeCapture() {
  const dialog = document.getElementById('capturePanel');
  if (dialog.open) dialog.close ? dialog.close() : dialog.removeAttribute('open');
}

function openEditModal(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || cloud?.locked) return;
  document.getElementById('modalNormal').disabled=!canCount(card,'normal');
  document.getElementById('modalFoil').disabled=!canCount(card,'foil');
  modalCloudToken = cloud?.editToken(cardId);
  document.getElementById('modalCardId').value = card.id;
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
  for (const button of document.querySelectorAll('.domain-pill')) {
    const icon = DOMAIN_ICONS[button.dataset.domain];
    if (icon) button.insertAdjacentHTML('afterbegin', renderIcon(icon));
  }
  if (window.RiftboundCloud) {
    cloud = window.RiftboundCloud.start({
      status: setStorageStatus,
      clear() {
        liveCatalog = null; state.cards = []; state.playsets = new Map();
        closeModal(); closeCardPanel(); closeCapture();
        for (const id of ['accountMenu', 'filterPanel']) document.getElementById(id).hidePopover?.();
        renderAll();
      },
      show(cards, catalog) {
        liveCatalog = catalog; state.cards = cards; state.playsets = summarizePlaysets(cards);
        refreshCatalogControls();
      },
      render: renderAll
    });
  }
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
    if (document.querySelector(':popover-open') || document.getElementById('capturePanel').open || !document.getElementById('cardModal').classList.contains('hidden')) return;
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

  const captureInput = document.getElementById('captureInput');
  document.getElementById('btnCapture').addEventListener('click', openCapture);
  document.getElementById('btnCloseCapture').addEventListener('click', closeCapture);
  document.getElementById('btnCaptureDone').addEventListener('click', closeCapture);
  document.getElementById('captureNormal').addEventListener('click', () => setCaptureFinish('normal'));
  document.getElementById('captureFoil').addEventListener('click', () => setCaptureFinish('foil'));
  captureInput.addEventListener('input', updateCaptureCandidates);
  captureInput.addEventListener('keydown', e => {
    const shown = Math.min(capture.candidates.length, CAPTURE_SHOWN);
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown) {
      e.preventDefault();
      capture.index = e.key === 'ArrowDown' ? (capture.index + 1) % shown : (capture.index <= 0 ? shown - 1 : capture.index - 1);
      renderCaptureCandidates();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const card = capture.candidates[capture.index];
      if (card) addCaptured(card);
      else if (capture.candidates.length > 1) setCaptureMessage(`${capture.candidates.length} cards match. Choose one with ↑ ↓ or a click.`);
    }
  });
  document.getElementById('captureCandidates').addEventListener('click', e => {
    const option = e.target.closest('[data-index]');
    if (option) { captureInput.focus(); addCaptured(capture.candidates[Number(option.dataset.index)]); }
  });
  document.getElementById('captureLog').addEventListener('click', e => {
    const undo = e.target.closest('[data-undo]');
    if (undo) undoCaptured(Number(undo.dataset.undo));
  });

  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeModal);

  document.getElementById('modalCardForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (cloud?.locked) return;
    const existingId = document.getElementById('modalCardId').value;
    const catalogCard = currentCatalog().find(c => c.id === existingId);
    const imageUrl = document.getElementById('modalImageUrl').value.trim() || catalogCard?.imageUrl || '';
    const normal = Math.max(0, parseInt(document.getElementById('modalNormal').value, 10) || 0);
    const foil = Math.max(0, parseInt(document.getElementById('modalFoil').value, 10) || 0);

    if (!catalogCard) return;
    const ok = await cloud.change(existingId, { normal, foil, image_override: imageUrl === catalogCard.imageUrl ? null : imageUrl }, modalCloudToken);
    if (ok) closeModal();
  });

  document.getElementById('btnExportJSON').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(backupRecord(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riftbound-sammlung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
