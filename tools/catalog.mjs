#!/usr/bin/env node
/**
 * tools/catalog.mjs
 *
 * Generates a self-contained HTML catalog of all Synergos UI elements.
 *
 * Usage:
 *   node tools/catalog.mjs               # → catalog.html at workspace root
 *   node tools/catalog.mjs --out dist/catalog.html
 *
 * Data sources:
 *   vitals/contracts/src/element-registry.json  — 56-element master registry
 *   vitals/contracts/src/element-inputs.json    — input descriptors per element
 *   $CDN_ROOT/registry.json                     — (optional) published versions
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

// ─── CLI flags ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const OUT = outFlag !== -1 ? resolve(args[outFlag + 1]) : join(ROOT, 'catalog.html');

// ─── Data loading ─────────────────────────────────────────────────────────────
const REGISTRY_PATH = join(ROOT, 'vitals/contracts/src/element-registry.json');
const INPUTS_PATH   = join(ROOT, 'vitals/contracts/src/element-inputs.json');
const CDN_ROOT      = process.env.CDN_ROOT ?? 'C:\\LOCAL_CDN\\synergos';

const registry   = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
const inputsData = JSON.parse(readFileSync(INPUTS_PATH, 'utf-8'));

let cdnRegistry = null;
const cdnRegistryPath = join(CDN_ROOT, 'registry.json');
if (existsSync(cdnRegistryPath)) {
  try { cdnRegistry = JSON.parse(readFileSync(cdnRegistryPath, 'utf-8')); } catch { /* skip */ }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const FRAMEWORKS  = ['angular'];   // la purga dejó UNA plataforma
const TIER_ORDER  = { module: 0, composition: 1, primitive: 2 };
const TIER_COLORS = { module: '#6366f1', composition: '#0ea5e9', primitive: '#10b981' };

// ─── CDN lookup: elementName → { framework → latestVersion } ─────────────────
const cdnMap = {};
if (cdnRegistry?.elements) {
  for (const entry of cdnRegistry.elements) {
    cdnMap[entry.name] = {};
    for (const [fw, info] of Object.entries(entry.implementations ?? {})) {
      cdnMap[entry.name][fw] = info.latest ?? null;
    }
  }
}

// ─── Sort: tier order, then alphabetically ───────────────────────────────────
const elements = [...registry].sort((a, b) => {
  const td = (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
  return td !== 0 ? td : a.name.localeCompare(b.name);
});

const counts = { module: 0, composition: 0, primitive: 0 };
for (const el of elements) { counts[el.tier] = (counts[el.tier] ?? 0) + 1; }

// ─── Renderers ────────────────────────────────────────────────────────────────
function renderInputs(name) {
  const inputs = inputsData[name] ?? [];
  if (!inputs.length) return '<p class="no-inputs">No inputs declared yet</p>';
  return `<table class="inputs-table">
    <thead><tr><th>Name</th><th>Type</th><th>Req</th><th>Default</th><th>Description</th></tr></thead>
    <tbody>${inputs.map(i => `<tr>
      <td><code>${i.name}</code></td>
      <td><span class="type-badge">${i.type}</span></td>
      <td class="${i.required ? 'req-yes' : 'req-no'}">${i.required ? '✓' : '—'}</td>
      <td>${i.default !== undefined && i.default !== '' ? `<code>${i.default}</code>` : '—'}</td>
      <td class="desc">${i.description ?? ''}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function renderFrameworks(name) {
  return FRAMEWORKS.map(fw => {
    const version = cdnMap[name]?.[fw];
    if (version) {
      return `<span class="fw-badge fw-active" title="Published v${version}">${fw} <small>v${version}</small></span>`;
    }
    return `<span class="fw-badge fw-inactive" title="Not published">${fw}</span>`;
  }).join('');
}

function renderCard(el) {
  const color  = TIER_COLORS[el.tier] ?? '#888';
  const inputs = inputsData[el.name] ?? [];
  return `
  <article class="card" data-tier="${el.tier}" data-name="${el.name}" data-text="${el.name} ${el.tag} ${el.alias}">
    <header>
      <span class="tier-badge" style="background:${color}">${el.tier}</span>
      <h3>${el.name}</h3>
    </header>
    <code class="tag-display">&lt;${el.tag}&gt;</code>
    <div class="meta">
      <span class="alias" title="CMS alias">${el.alias}</span>
      <span class="input-count">${inputs.length} input${inputs.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="frameworks">${renderFrameworks(el.name)}</div>
    <details>
      <summary>Inputs (${inputs.length})</summary>
      ${renderInputs(el.name)}
    </details>
  </article>`;
}

// ─── CDN status note ──────────────────────────────────────────────────────────
const cdnNote = cdnRegistry
  ? `<small class="cdn-note cdn-ok">CDN registry v${cdnRegistry.version} · ${cdnRegistry.generated?.slice(0, 10)}</small>`
  : `<small class="cdn-note cdn-missing">CDN registry not found — run <code>npm run publish:cdn</code></small>`;

// ─── HTML ─────────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Synergos UI — Element Catalog</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }

    /* ── Site header ── */
    .site-header { background: #1e293b; border-bottom: 1px solid #334155; padding: 1.25rem 2rem; display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
    .site-header h1 { font-size: 1.375rem; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em; }
    .site-header h1 span { color: #818cf8; }
    .stats { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .stat-chip { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.65rem; border-radius: 999px; white-space: nowrap; }
    .cdn-note { font-size: 0.7rem; margin-left: auto; }
    .cdn-ok   { color: #4ade80; }
    .cdn-missing { color: #94a3b8; }
    .cdn-note code { background: #334155; padding: 0.1rem 0.3rem; border-radius: 3px; }

    /* ── Controls ── */
    .controls { padding: 1rem 2rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; background: #0f172a; border-bottom: 1px solid #1e293b; position: sticky; top: 0; z-index: 10; }
    .search-wrap { position: relative; }
    .search-wrap input { background: #1e293b; border: 1px solid #334155; color: #e2e8f0; padding: 0.45rem 1rem 0.45rem 2.25rem; border-radius: 8px; font-size: 0.85rem; width: 22rem; outline: none; transition: border-color 0.15s; }
    .search-wrap input:focus { border-color: #6366f1; }
    .search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #475569; pointer-events: none; font-size: 0.85rem; }
    .filter-btns { display: flex; gap: 0.4rem; }
    .filter-btn { background: #1e293b; border: 1px solid #334155; color: #94a3b8; padding: 0.35rem 0.9rem; border-radius: 8px; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
    .filter-btn:hover { color: #f1f5f9; border-color: #6366f1; }
    .filter-btn.active { color: #f8fafc; background: #312e81; border-color: #6366f1; }
    .count-label { font-size: 0.78rem; color: #475569; margin-left: auto; }

    /* ── Grid ── */
    main { padding: 1.5rem 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }
    .empty-state { text-align: center; padding: 4rem; color: #475569; font-size: 0.9rem; grid-column: 1/-1; }

    /* ── Card ── */
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.125rem; transition: border-color 0.2s, box-shadow 0.2s; }
    .card:hover { border-color: #475569; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .card header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; }
    .tier-badge { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #fff; padding: 0.2rem 0.55rem; border-radius: 4px; flex-shrink: 0; }
    .card h3 { font-size: 0.95rem; font-weight: 600; color: #f1f5f9; }
    .tag-display { display: block; font-size: 0.72rem; color: #7dd3fc; background: rgba(14,165,233,0.1); border: 1px solid rgba(14,165,233,0.2); padding: 0.2rem 0.55rem; border-radius: 4px; margin-bottom: 0.65rem; width: fit-content; }
    .meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.65rem; }
    .alias { font-size: 0.68rem; color: #64748b; font-family: monospace; }
    .input-count { font-size: 0.68rem; color: #64748b; }
    .frameworks { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.65rem; }
    .fw-badge { font-size: 0.68rem; padding: 0.18rem 0.55rem; border-radius: 4px; font-weight: 500; white-space: nowrap; }
    .fw-active   { background: #052e16; color: #86efac; border: 1px solid #166534; }
    .fw-inactive { background: #0f172a; color: #3f4f63; border: 1px solid #1e293b; }
    .fw-active small { opacity: 0.7; font-size: 0.6rem; }

    /* ── Details / inputs ── */
    details { border-top: 1px solid #1e293b; padding-top: 0.5rem; margin-top: 0.25rem; }
    summary { font-size: 0.78rem; color: #64748b; cursor: pointer; user-select: none; padding: 0.25rem 0; list-style: none; display: flex; align-items: center; gap: 0.4rem; }
    summary::before { content: '▸'; font-size: 0.6rem; transition: transform 0.15s; }
    details[open] summary::before { transform: rotate(90deg); }
    summary:hover { color: #94a3b8; }
    .inputs-table { width: 100%; border-collapse: collapse; margin-top: 0.6rem; font-size: 0.72rem; }
    .inputs-table th { color: #475569; text-align: left; padding: 0.25rem 0.4rem; border-bottom: 1px solid #334155; font-weight: 500; white-space: nowrap; }
    .inputs-table td { padding: 0.25rem 0.4rem; border-bottom: 1px solid #172032; color: #cbd5e1; vertical-align: top; }
    .inputs-table code { color: #7dd3fc; font-size: 0.68rem; }
    .type-badge { font-size: 0.62rem; background: #1e3a5f; color: #93c5fd; padding: 0.1rem 0.35rem; border-radius: 3px; font-weight: 500; }
    .req-yes { color: #4ade80; font-weight: 600; }
    .req-no  { color: #475569; }
    .desc    { color: #64748b; font-style: italic; }
    .no-inputs { font-size: 0.73rem; color: #3f4f63; padding: 0.5rem 0; }

    /* ── Misc ── */
    .hidden { display: none !important; }
    footer { padding: 1.5rem 2rem; text-align: center; font-size: 0.72rem; color: #334155; border-top: 1px solid #1e293b; margin-top: 1rem; }
  </style>
</head>
<body>
  <header class="site-header">
    <h1>Synergos <span>UI</span></h1>
    <div class="stats">
      <span class="stat-chip" style="background:#1e1b4b;color:#a5b4fc">${elements.length} elements</span>
      <span class="stat-chip" style="background:#312e81;color:#818cf8">${counts.module ?? 0} modules</span>
      <span class="stat-chip" style="background:#0c4a6e;color:#7dd3fc">${counts.composition ?? 0} compositions</span>
      <span class="stat-chip" style="background:#052e16;color:#86efac">${counts.primitive ?? 0} primitives</span>
    </div>
    ${cdnNote}
  </header>

  <div class="controls">
    <div class="search-wrap">
      <span class="search-icon">⌕</span>
      <input type="search" id="search" placeholder="Search name, tag, alias…" autocomplete="off" />
    </div>
    <div class="filter-btns">
      <button class="filter-btn active" data-filter="all">All</button>
      <button class="filter-btn" data-filter="module">Module</button>
      <button class="filter-btn" data-filter="composition">Composition</button>
      <button class="filter-btn" data-filter="primitive">Primitive</button>
    </div>
    <span class="count-label" id="count-label">${elements.length} elements</span>
  </div>

  <main>
    <div class="grid" id="grid">
      ${elements.map(renderCard).join('\n')}
      <p class="empty-state hidden" id="empty-state">No elements match your search.</p>
    </div>
  </main>

  <footer>
    Generated ${new Date().toISOString().slice(0, 10)} &middot; Synergos UI Element Catalog
  </footer>

  <script>
    const cards      = Array.from(document.querySelectorAll('.card'));
    const countLabel = document.getElementById('count-label');
    const emptyState = document.getElementById('empty-state');
    let activeFilter = 'all';
    let searchQuery  = '';

    function applyFilters() {
      let visible = 0;
      for (const card of cards) {
        const matchesTier   = activeFilter === 'all' || card.dataset.tier === activeFilter;
        const matchesSearch = !searchQuery || card.dataset.text.includes(searchQuery);
        const show = matchesTier && matchesSearch;
        card.classList.toggle('hidden', !show);
        if (show) visible++;
      }
      countLabel.textContent = visible + ' element' + (visible !== 1 ? 's' : '');
      emptyState.classList.toggle('hidden', visible > 0);
    }

    document.getElementById('search').addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        applyFilters();
      });
    });
  </script>
</body>
</html>`;

writeFileSync(OUT, html, 'utf-8');
console.log(`✓  Catalog generated → ${OUT}`);
console.log(`   ${elements.length} elements: ${counts.module} modules · ${counts.composition} compositions · ${counts.primitive ?? 0} primitives`);
if (!cdnRegistry) {
  console.log(`   CDN registry not found at ${cdnRegistryPath} — framework availability shown as "not published"`);
}
