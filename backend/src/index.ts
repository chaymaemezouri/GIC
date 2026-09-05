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
import officeCashRoutes from './routes/officeCash.js';
import { uploadDir } from './lib/uploadPaths.js';

const app = express();
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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
app.use(
  '/uploads',
  express.static(uploadDir, {
    fallthrough: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
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
app.use('/api/caisse-bureau', officeCashRoutes);
app.use('/api', miscRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Erreur serveur' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`GIC API prête sur http://localhost:${port}`);
});
