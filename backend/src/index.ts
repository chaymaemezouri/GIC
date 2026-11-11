import 'dotenv/config';
import './lib/asyncErrors.js';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/auth.js';
import clientsRoutes from './routes/clients.js';
import agentsRoutes from './routes/agents.js';
import mandantsRoutes from './routes/mandants.js';
import immobilierRoutes from './routes/immobilier.js';
import transactionsRoutes from './routes/transactions.js';
import financeRoutes from './routes/finance.js';
import achatsRoutes from './routes/achats.js';
import chantiersRoutes from './routes/chantiers.js';
import enginsRoutes from './routes/engins.js';
import dashboardRoutes from './routes/dashboard.js';
import miscRoutes from './routes/misc.js';
import documentsRoutes from './routes/documents.js';
import portalRoutes from './routes/portal.js';
import messagingRoutes from './routes/messaging.js';
import equipeInterneRoutes from './routes/equipeInterne.js';
import reconnusRoutes from './routes/reconnus.js';
import entreprisesRoutes from './routes/entreprises.js';
import officeCashRoutes from './routes/officeCash.js';
import { legacyUploadDir, uploadDir } from './lib/uploadPaths.js';
import { sheetPreview, resolveSafeUpload } from './lib/sheetPreview.js';
import { backfillPointageSessions, repairPointageSessionExclusions } from './lib/pointageSessions.js';
import { migrateLegacyPurchases } from './lib/purchaseWorkflow.js';
import { migrateEnginFleet } from './lib/enginCosts.js';
import { prisma } from './lib/prisma.js';
import { cinDuplicateResponse } from './lib/uniqueness.js';
import { ensureWorkspaceColumns } from './lib/workspace.js';
import { backfillOfficeCashFromPayments } from './lib/cashSync.js';

const app = express();
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Le visualiseur PDF de Chrome reste blanc si ces en-têtes sont présents sur le fichier.
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    originAgentCluster: false,
    // API + fichiers statiques (pas de HTML) — le CSP casse notamment les SVG en <img>
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
// Le plugin PDF du navigateur laisse la page blanche. Une navigation vers un PDF
// ouvre l’aperçu de l’application, qui dessine les pages lui-même.
function redirectPdfNavigation(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const name = (req.path.split('/').pop() || '').toLowerCase();
  if (!name.endsWith('.pdf') || String(req.query.raw || '') === '1') return next();
  const dest = String(req.get('sec-fetch-dest') || '');
  const mode = String(req.get('sec-fetch-mode') || '');
  if (dest !== 'document' && dest !== 'iframe' && mode !== 'navigate') return next();
  let filePath = req.originalUrl.split('?')[0];
  try { filePath = decodeURIComponent(filePath); } catch { /* garder le chemin brut */ }
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, `/apercu?src=${encodeURIComponent(filePath)}`);
}

const uploadStatic = {
  fallthrough: true,
  setHeaders(res: express.Response, filePath: string) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.setHeader('Cache-Control', filePath.toLowerCase().endsWith('.pdf') ? 'no-cache' : 'public, max-age=86400');
  },
};

// /api/uploads passe par le même proxy que l’API. /uploads reste pour le dev local.
const uploadRoots = legacyUploadDir === uploadDir ? [uploadDir] : [uploadDir, legacyUploadDir];

const previewMime: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

// URL sans extension : le serveur web de production intercepte parfois les .pdf
// avant de les transmettre à l’API, et l’aperçu reçoit alors une page HTML.
app.get('/api/files/content', (req, res) => {
  const rel = String(req.query.f || '').replace(/\\/g, '/');
  if (!rel || rel.split('/').includes('..')) {
    return res.status(400).json({ message: 'Fichier invalide' });
  }
  const file = resolveSafeUpload(rel, uploadRoots);
  if (!file) return res.status(404).json({ message: 'Fichier introuvable' });
  const ext = path.extname(file).toLowerCase();
  res.setHeader('Content-Type', previewMime[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(file);
});

for (const prefix of ['/uploads', '/api/uploads']) {
  app.use(prefix, redirectPdfNavigation);
  app.use(prefix, sheetPreview(uploadRoots));
  app.use(prefix, express.static(uploadDir, uploadStatic));
  if (legacyUploadDir !== uploadDir) {
    app.use(prefix, express.static(legacyUploadDir, uploadStatic));
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'GIC', version: '1.0.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/mandants', mandantsRoutes);
app.use('/api/immobilier', immobilierRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/achats', achatsRoutes);
app.use('/api/chantiers', chantiersRoutes);
app.use('/api/engins', enginsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/equipe-interne', equipeInterneRoutes);
app.use('/api/reconnus', reconnusRoutes);
app.use('/api/entreprises', entreprisesRoutes);
app.use('/api/caisse-bureau', officeCashRoutes);
app.use('/api', miscRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const duplicateCin = cinDuplicateResponse(err);
  if (duplicateCin) return res.status(400).json(duplicateCin);
  console.error(err);
  res.status(500).json({ message: err.message || 'Erreur serveur' });
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason);
});

const DELIVERY_COLUMNS = [
  'ALTER TABLE "Agent" ADD COLUMN bankName TEXT',
  'ALTER TABLE "Agent" ADD COLUMN rib TEXT',
  'ALTER TABLE "Reconnu" ADD COLUMN bankName TEXT',
  'ALTER TABLE "Reconnu" ADD COLUMN rib TEXT',
  'ALTER TABLE "Entreprise" ADD COLUMN bankName TEXT',
  'ALTER TABLE "Entreprise" ADD COLUMN rib TEXT',
  'ALTER TABLE "Mandant" ADD COLUMN bankName TEXT',
  'ALTER TABLE "Mandant" ADD COLUMN rib TEXT',
  'ALTER TABLE "Client" ADD COLUMN bankName TEXT',
  'ALTER TABLE "Client" ADD COLUMN rib TEXT',
  'ALTER TABLE "Supplier" ADD COLUMN ice TEXT',
  'ALTER TABLE "OfficeCashMovement" ADD COLUMN sourceType TEXT',
  'ALTER TABLE "OfficeCashMovement" ADD COLUMN sourceId TEXT',
  'ALTER TABLE "OfficeCashMovement" ADD COLUMN sourceParent TEXT',
  'ALTER TABLE "InternalStaffSalaryRecord" ADD COLUMN paymentMode TEXT',
];

async function ensureDeliveryColumns(client: typeof prisma) {
  for (const sql of DELIVERY_COLUMNS) {
    try {
      await client.$executeRawUnsafe(sql);
    } catch {
      /* colonne déjà présente */
    }
  }
}

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`GIC API prête sur http://localhost:${port}`);
  prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL')
    .then(() => prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL'))
    .then(() => prisma.$queryRawUnsafe('PRAGMA busy_timeout=8000'))
    .catch((err) => console.error('SQLite', err));
  ensureDeliveryColumns(prisma).catch((err) => console.error('Colonnes livraison', err));
  ensureWorkspaceColumns(prisma).catch((err) => console.error('Espaces de travail', err));
  repairPointageSessionExclusions()
    .catch((err) => console.error('Réparation exclusions pointage', err))
    .then(() => backfillPointageSessions())
    .then((n) => {
      if (n) console.log(`Pointage : ${n} ligne(s) historiques rattachées à un pointage journalier`);
    })
    .catch((err) => console.error('Backfill pointage sessions', err));
  migrateLegacyPurchases()
    .then((n) => {
      if (n) console.log(`Achats : ${n} achat(s) repris dans le nouveau cycle (lignes, statuts, paiements)`);
    })
    .catch((err) => console.error('Migration achats', err));
  migrateEnginFleet()
    .then((n) => {
      if (n) console.log(`Engins & Matériels : ${n} fiche(s) normalisée(s)`);
    })
    .catch((err) => console.error('Migration engins', err));
  backfillOfficeCashFromPayments()
    .then((n) => {
      if (n) console.log(`Caisse : ${n} paiement(s) espèces repris`);
    })
    .catch((err) => console.error('Caisse espèces', err));
});
