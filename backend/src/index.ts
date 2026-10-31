import 'dotenv/config';
import express from 'express';
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
import { uploadDir } from './lib/uploadPaths.js';
import { backfillPointageSessions, repairPointageSessionExclusions } from './lib/pointageSessions.js';
import { migrateLegacyPurchases } from './lib/purchaseWorkflow.js';
import { migrateEnginFleet } from './lib/enginCosts.js';
import { prisma } from './lib/prisma.js';
import { ensureWorkspaceColumns } from './lib/workspace.js';

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
app.use('/uploads', (req, res, next) => {
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
});
app.use(
  '/uploads',
  express.static(uploadDir, {
    fallthrough: true,
    setHeaders(res, filePath) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.removeHeader('Cross-Origin-Opener-Policy');
      res.removeHeader('Cross-Origin-Embedder-Policy');
      res.setHeader('Cache-Control', filePath.toLowerCase().endsWith('.pdf') ? 'no-cache' : 'public, max-age=86400');
    },
  })
);

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
  console.error(err);
  res.status(500).json({ message: err.message || 'Erreur serveur' });
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason);
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`GIC API prête sur http://localhost:${port}`);
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
});
