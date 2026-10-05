#!/usr/bin/env node
/**
 * Test général GIC — toutes les listes API + fiches échantillon + règles métier.
 * Usage : node backend/scripts/smoke-test.mjs
 * Env : API_URL (défaut http://127.0.0.1:4001)  ADMIN_EMAIL  ADMIN_PASSWORD
 */
const API = (process.env.API_URL || 'http://127.0.0.1:4001').replace(/\/$/, '');
const FRONT = (process.env.FRONT_URL || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || 'admin@gic.ma';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2026';

const LIST_GETS = [
  '/api/health',
  '/api/dashboard',
  '/api/clients?limit=20',
  '/api/agents?limit=20',
  '/api/mandants?limit=20',
  '/api/reconnus',
  '/api/entreprises',
  '/api/immobilier/locations',
  '/api/immobilier/projects?limit=20',
  '/api/immobilier/properties?limit=20',
  '/api/immobilier/properties/stats',
  '/api/transactions/sales?limit=20',
  '/api/transactions/rentals?limit=20',
  '/api/transactions/payments?limit=20',
  '/api/finance/accounts',
  '/api/finance/movements?limit=20',
  '/api/finance/decaissements?limit=20',
  '/api/finance/comptabilite/stats',
  '/api/caisse-bureau',
  '/api/achats/suppliers?limit=20',
  '/api/achats/purchases?limit=20',
  '/api/achats/families',
  '/api/chantiers?limit=20',
  '/api/chantiers/stats',
  '/api/chantiers/workforce?limit=20',
  '/api/chantiers/pointage?limit=20',
  '/api/chantiers/pointage/sessions?chantierId=demo-chantier',
  '/api/chantiers/avancement',
  '/api/chantiers/salaries?limit=20',
  '/api/chantiers/tasks/standard',
  '/api/engins?limit=20',
  '/api/engins/list',
  '/api/engins/missions?limit=20',
  '/api/engins/maintenances?limit=20',
  '/api/engins/assignments?limit=20',
  '/api/engins/fuel-logs?limit=20',
  '/api/engins/expenses?limit=20',
  '/api/engins/dashboard',
  '/api/documents?limit=20',
  '/api/notifications',
  '/api/audit?limit=20',
  '/api/settings/company',
  '/api/dropdowns',
  '/api/equipe-interne',
  '/api/auth/users',
  '/api/search?q=atlas',
];

const FRONT_PAGES = [
  '/', '/clients', '/biens', '/ventes', '/locations', '/chantiers', '/entreprises',
  '/fournisseurs', '/achats', '/encaissements', '/balance', '/caisse', '/pointage',
  '/engins', '/documents', '/equipe-interne', '/reconnus', '/parametres',
];

function firstId(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0]?.id || null;
  const items = payload.items || payload.purchases || payload.movements;
  if (Array.isArray(items) && items[0]?.id) return items[0].id;
  return payload.id || null;
}

async function req(path, token, { method = 'GET', body, timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json, text: text.slice(0, 180) };
  } finally {
    clearTimeout(t);
  }
}

const fails = [];
const warns = [];
let okCount = 0;

function fail(label, detail) {
  fails.push(`${label} — ${detail}`);
  console.log(`  FAIL  ${label}  ${detail}`);
}
function warn(label, detail) {
  warns.push(`${label} — ${detail}`);
  console.log(`  WARN  ${label}  ${detail}`);
}
function pass(label) {
  okCount++;
  console.log(`  OK    ${label}`);
}

console.log(`\nGIC smoke — ${API}\n`);

const login = await req('/api/auth/login', null, { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
if (!login.ok || !login.json?.token) {
  console.error('Login admin impossible', login.status, login.json || login.text);
  process.exit(1);
}
const token = login.json.token;
pass('POST /api/auth/login');

for (const path of LIST_GETS) {
  const r = await req(path, path === '/api/health' ? null : token);
  if (!r.ok) fail(`GET ${path}`, `${r.status} ${r.json?.message || r.text}`);
  else pass(`GET ${path}`);
}

async function sample(listPath, detailBuilder, label) {
  const list = await req(listPath, token);
  if (!list.ok) {
    fail(`${label} liste`, `${list.status}`);
    return null;
  }
  const id = firstId(list.json);
  if (!id) {
    warn(label, 'liste vide (pas de fiche à ouvrir)');
    return null;
  }
  const det = await req(detailBuilder(id), token);
  if (!det.ok) fail(`${label} fiche`, `${det.status} ${det.json?.message || det.text}`);
  else pass(`${label} fiche ${id}`);
  return { id, json: det.json };
}

await sample('/api/clients?limit=5', (id) => `/api/clients/${id}`, 'Client');
await sample('/api/agents?limit=5', (id) => `/api/agents/${id}`, 'Agent');
await sample('/api/mandants?limit=5', (id) => `/api/mandants/${id}`, 'Mandant');
await sample('/api/immobilier/projects?limit=5', (id) => `/api/immobilier/projects/${id}`, 'Projet');
await sample('/api/immobilier/properties?limit=5', (id) => `/api/immobilier/properties/${id}`, 'Bien');
await sample('/api/transactions/sales?limit=5', (id) => `/api/transactions/sales/${id}`, 'Vente');
await sample('/api/transactions/rentals?limit=5', (id) => `/api/transactions/rentals/${id}`, 'Location');
await sample('/api/transactions/payments?limit=5', (id) => `/api/transactions/payments/${id}`, 'Encaissement');
await sample('/api/achats/suppliers?limit=5', (id) => `/api/achats/suppliers/${id}`, 'Fournisseur');
await sample('/api/achats/purchases?limit=5', (id) => `/api/achats/purchases/${id}`, 'Achat');
await sample('/api/chantiers?limit=5', (id) => `/api/chantiers/${id}`, 'Chantier');
await sample('/api/chantiers/workforce?limit=5', (id) => `/api/chantiers/workforce/${id}`, 'Ouvrier');
await sample('/api/engins?limit=5', (id) => `/api/engins/${id}`, 'Engin');
await sample('/api/documents?limit=5', (id) => `/api/documents/${id}`, 'Document');
await sample('/api/equipe-interne', (id) => `/api/equipe-interne/${id}`, 'Équipe interne');
await sample('/api/reconnus', (id) => `/api/reconnus/${id}`, 'Reconnu');
await sample('/api/finance/movements?limit=5', (id) => `/api/finance/movements/${id}`, 'Mouvement caisse');

const ents = await req('/api/entreprises', token);
if (ents.ok && firstId(ents.json)) {
  const eid = firstId(ents.json);
  const t0 = Date.now();
  const det = await req(`/api/entreprises/${eid}`, token, { timeoutMs: 25000 });
  const ms = Date.now() - t0;
  if (!det.ok) fail('Fiche entreprise', `${det.status} ${det.json?.message || det.text}`);
  else if (!det.json?.companyName) fail('Fiche entreprise', 'sans companyName');
  else {
    pass(`Fiche entreprise ${det.json.companyName} (${ms} ms, ${det.json.totals?.count ?? 0} ST)`);
    if (!Array.isArray(det.json.subcontractors)) warn('Fiche entreprise', 'pas de tableau subcontractors');
  }
} else warn('Entreprises', 'liste vide');

const chList = await req('/api/chantiers?limit=20', token);
const chId = firstId(chList.json);
if (chId) {
  const st = await req(`/api/chantiers/${chId}/subcontractors`, token);
  if (!st.ok) fail('Sous-traitants chantier', `${st.status} ${st.json?.message || st.text}`);
  else {
    const rows = Array.isArray(st.json) ? st.json : [];
    pass(`Sous-traitants chantier (${rows.length})`);
    if (rows.length && rows.every((r) => !r.entrepriseId)) warn('ST', 'aucun entrepriseId (fiches société non liées)');
    const prog = await req(`/api/chantiers/${chId}/progress`, token);
    if (!prog.ok) fail('Avancement chantier', `${prog.status}`);
    else pass('Avancement chantier');
    const tr = await req(`/api/chantiers/${chId}/tranches`, token);
    if (!tr.ok) fail('Tranches chantier', `${tr.status}`);
    else pass(`Tranches chantier (${Array.isArray(tr.json) ? tr.json.length : 0})`);
  }
}

const props = await req('/api/immobilier/properties?limit=90', token);
const items = props.json?.items || [];
let occupancyBad = 0;
for (const p of items) {
  const type = p.type || 'vente';
  const status = String(p.status || '');
  if (type === 'vente' && status === 'loué') occupancyBad++;
  if (type === 'location' && status === 'vendu') occupancyBad++;
}
if (occupancyBad) fail('Occupancy type/statut', `${occupancyBad} bien(s) incohérents (vente+loué ou location+vendu)`);
else pass(`Occupancy (${items.length} biens)`);

const payments = await req('/api/transactions/payments?limit=50', token);
const pays = payments.json?.items || [];
const modes = new Set(pays.map((p) => p.operationType).filter(Boolean));
if (modes.size < 2) warn('Modes paiement', `peu de variété (${[...modes].join(', ') || 'aucun'})`);
else pass(`Modes paiement ${[...modes].join(', ')}`);

try {
  const front = await fetch(FRONT + '/login', { signal: AbortSignal.timeout(8000) });
  if (front.ok) pass(`Frontend ${FRONT}/login`);
  else fail('Frontend login', `HTTP ${front.status}`);
  for (const page of FRONT_PAGES) {
    const r = await fetch(FRONT + page, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) fail(`SPA ${page}`, `HTTP ${r.status}`);
    else pass(`SPA ${page}`);
  }
} catch (err) {
  warn('Frontend', err instanceof Error ? err.message : String(err));
}

console.log(`\nRésultat : ${okCount} OK, ${warns.length} avertissement(s), ${fails.length} échec(s)`);
if (warns.length) {
  console.log('\nAvertissements :');
  for (const w of warns) console.log(' -', w);
}
if (fails.length) {
  console.log('\nÉchecs :');
  for (const f of fails) console.log(' -', f);
  process.exit(1);
}
console.log('\nTest général : succès.\n');
