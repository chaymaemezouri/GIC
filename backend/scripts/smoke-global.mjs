/**
 * Smoke test global GIC — API + uploads + pages front
 * Usage: node scripts/smoke-global.mjs
 */
const API = process.env.API_URL || 'http://localhost:4001';
const WEB = process.env.WEB_URL || 'http://localhost:5173';
const EMAIL = process.env.GIC_EMAIL || 'admin@gic.ma';
const PASSWORD = process.env.GIC_PASSWORD || 'Admin@2026';

const results = [];
let passed = 0;
let failed = 0;
let warn = 0;

function ok(name, detail = '') {
  passed++;
  results.push({ status: 'PASS', name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failed++;
  results.push({ status: 'FAIL', name, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}
function soft(name, detail = '') {
  warn++;
  results.push({ status: 'WARN', name, detail });
  console.log(`  ~ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { res, data, status: res.status };
}

async function page(path) {
  const res = await fetch(`${WEB}${path}`, { redirect: 'follow' });
  const html = await res.text();
  return { status: res.status, html, hasRoot: html.includes('id="root"') || html.includes('id=root') };
}

console.log('\n=== GIC SMOKE TEST GLOBAL ===\n');
console.log(`API ${API} | WEB ${WEB}\n`);

// ── 1. Infra ──
console.log('1. Infrastructure');
{
  const h = await api('/api/health');
  if (h.status === 200 && h.data?.ok) ok('GET /api/health', JSON.stringify(h.data));
  else fail('GET /api/health', `${h.status} ${JSON.stringify(h.data)}`);

  try {
    const w = await page('/');
    if (w.status === 200 && w.hasRoot) ok('Frontend /', `HTTP ${w.status}`);
    else fail('Frontend /', `HTTP ${w.status}`);
  } catch (e) {
    fail('Frontend /', e.message);
  }
}

// ── 2. Auth ──
console.log('\n2. Authentification');
let token = '';
{
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (login.status === 200 && login.data?.token) {
    token = login.data.token;
    ok('POST /api/auth/login', EMAIL);
  } else {
    fail('POST /api/auth/login', `${login.status} ${JSON.stringify(login.data)}`);
  }

  if (token) {
    const me = await api('/api/auth/me', { token });
    if (me.status === 200 && me.data?.email) ok('GET /api/auth/me', me.data.email);
    else fail('GET /api/auth/me', `${me.status}`);
  }
}

if (!token) {
  console.log('\n⛔ Impossible de continuer sans token.\n');
  process.exit(1);
}

// ── 3. List APIs ──
console.log('\n3. APIs listes (modules)');
const listEndpoints = [
  ['/api/dashboard', 'Dashboard'],
  ['/api/clients?limit=5&page=1', 'Clients'],
  ['/api/agents?limit=5&page=1', 'Agents'],
  ['/api/mandants?limit=5&page=1', 'Mandants'],
  ['/api/reconnus?limit=5&page=1', 'Reconnus'],
  ['/api/immobilier/projects?limit=5&page=1', 'Projets'],
  ['/api/immobilier/properties?limit=5&page=1', 'Biens'],
  ['/api/transactions/sales?limit=5&page=1', 'Ventes'],
  ['/api/transactions/rentals?limit=5&page=1', 'Locations'],
  ['/api/transactions/payments?limit=5&page=1', 'Encaissements'],
  ['/api/finance/movements?limit=5&page=1', 'Balance'],
  ['/api/caisse-bureau?limit=5&page=1', 'Caisse bureau'],
  ['/api/achats/purchases?limit=5&page=1', 'Achats'],
  ['/api/achats/suppliers?limit=5&page=1', 'Fournisseurs'],
  ['/api/chantiers?limit=5&page=1', 'Chantiers'],
  ['/api/chantiers/workforce?limit=5&page=1', 'Main-d’œuvre'],
  ['/api/engins?limit=5&page=1', 'Engins'],
  ['/api/documents?limit=5&page=1', 'Documents'],
  ['/api/equipe-interne?limit=5&page=1', 'Équipe interne'],
  ['/api/notifications?limit=5', 'Notifications'],
  ['/api/dropdowns?limit=5&page=1', 'Référentiels'],
];

const altPaths = {};

const firstIds = {};

for (const [path, label] of listEndpoints) {
  let r = await api(path, { token });
  if (r.status >= 200 && r.status < 300) {
    const items = r.data?.items || r.data?.data || (Array.isArray(r.data) ? r.data : null);
    const total = r.data?.total ?? (items ? items.length : '—');
    ok(label, `HTTP ${r.status} total=${total}`);
    if (items?.[0]?.id) {
      const key = label.toLowerCase();
      firstIds[key] = items[0].id;
    }
  } else if (r.status === 404) {
    soft(label, `route 404 (${path})`);
  } else {
    fail(label, `HTTP ${r.status} ${typeof r.data === 'object' ? r.data?.message || JSON.stringify(r.data).slice(0, 120) : String(r.data).slice(0, 120)}`);
  }
}

// Discover more list routes by probing known patterns from front
console.log('\n3b. APIs complémentaires');
const extra = [
  ['/api/finance/decaissements?limit=5&page=1', 'Décaissements'],
  ['/api/chantiers/avancement?limit=5&page=1', 'Avancement'],
  ['/api/engins/missions?limit=5&page=1', 'Missions'],
  ['/api/engins/maintenances?limit=5&page=1', 'Maintenance'],
  ['/api/equipe-interne/salaires?limit=5&page=1', 'Salaires équipe'],
  ['/api/chantiers/pointage?limit=5&page=1', 'Pointage'],
  ['/api/chantiers/salaries?limit=5&page=1', 'Salaires MO'],
  ['/api/auth/users?limit=5&page=1', 'Utilisateurs'],
  ['/api/audit?limit=5&page=1', 'Audit'],
  ['/api/settings/company', 'Paramètres société'],
];

for (const [path, label] of extra) {
  const r = await api(path, { token });
  if (r.status >= 200 && r.status < 300) ok(label, `HTTP ${r.status}`);
  else if (r.status === 404) soft(label, `404 ${path}`);
  else fail(label, `HTTP ${r.status} ${r.data?.message || ''}`);
}

// ── 4. Detail + uploads ──
console.log('\n4. Détails & uploads');
{
  // Clients detail
  const clients = await api('/api/clients?limit=1&page=1', { token });
  const c = clients.data?.items?.[0];
  if (c?.id) {
    const d = await api(`/api/clients/${c.id}`, { token });
    if (d.status === 200) ok('Client détail', c.reference || c.id);
    else fail('Client détail', `${d.status}`);
    if (c.photo) {
      const u = await fetch(`${API}${c.photo.startsWith('/') ? c.photo : `/${c.photo}`}`);
      const viaWeb = await fetch(`${WEB}${c.photo.startsWith('/') ? c.photo : `/${c.photo}`}`);
      if (u.ok) ok('Upload via API', c.photo);
      else fail('Upload via API', `${u.status} ${c.photo}`);
      if (viaWeb.ok) ok('Upload via Vite proxy', c.photo);
      else fail('Upload via Vite proxy', `${viaWeb.status}`);
    } else soft('Upload photo client', 'aucune photo sur le 1er client');
  }

  // Admin photo
  const me = await api('/api/auth/me', { token });
  if (me.data?.photo) {
    const u = await fetch(`${API}${me.data.photo}`);
    if (u.ok) ok('Photo profil admin', me.data.photo);
    else fail('Photo profil admin', `${u.status}`);
  }
}

// ── 5. Frontend routes shell ──
console.log('\n5. Pages frontend (shell HTML)');
const pages = [
  '/login',
  '/',
  '/clients',
  '/agents',
  '/mandants',
  '/projets',
  '/biens',
  '/ventes',
  '/locations',
  '/encaissements',
  '/decaissements',
  '/balance',
  '/caisse',
  '/salaires',
  '/achats',
  '/fournisseurs',
  '/chantiers',
  '/main-oeuvre',
  '/chauffeurs',
  '/pointage',
  '/equipe-interne',
  '/engins',
  '/missions',
  '/maintenance',
  '/avancement',
  '/documents',
  '/notifications',
  '/audit',
  '/parametres',
  '/referentiels',
  '/utilisateurs',
];

for (const p of pages) {
  try {
    const r = await page(p);
    if (r.status === 200 && r.hasRoot) ok(`Page ${p}`);
    else if (r.status === 200) soft(`Page ${p}`, '200 sans #root');
    else fail(`Page ${p}`, `HTTP ${r.status}`);
  } catch (e) {
    fail(`Page ${p}`, e.message);
  }
}

// ── Summary ──
console.log('\n=== RÉSUMÉ ===');
console.log(`PASS ${passed} | FAIL ${failed} | WARN ${warn} | TOTAL ${passed + failed + warn}`);
if (failed === 0) {
  console.log('\n✅ Aucune erreur bloquante détectée.\n');
  process.exit(0);
} else {
  console.log('\n❌ Des erreurs ont été détectées — voir détails ci-dessus.\n');
  process.exit(1);
}
