import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DialogProvider from './components/DialogProvider';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import PortalLoginPage from './pages/PortalLoginPage';
import ForbiddenPage from './pages/ForbiddenPage';
import { FEATURE_FLAGS } from './lib/featureFlags';
import { useI18n } from './i18n/I18nContext';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));
const AgentsPage = lazy(() => import('./pages/AgentsPage'));
const AgentDetailPage = lazy(() => import('./pages/AgentDetailPage'));
const BiensPage = lazy(() => import('./pages/BiensPage'));
const VentesPage = lazy(() => import('./pages/VentesPage'));
const VenteDetailPage = lazy(() => import('./pages/VenteDetailPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const FinanceDetailPage = lazy(() => import('./pages/FinanceDetailPage'));
const AchatsPage = lazy(() => import('./pages/AchatsPage'));
const AchatDetailPage = lazy(() => import('./pages/AchatDetailPage'));
const ChantiersPage = lazy(() => import('./pages/ChantiersPage'));
const ChantierDetailPage = lazy(() => import('./pages/ChantierDetailPage'));
const EnginsPage = lazy(() => import('./pages/EnginsPage'));
const EnginDetailPage = lazy(() => import('./pages/EnginDetailPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const DocumentDetailPage = lazy(() => import('./pages/DocumentDetailPage'));
const ArchiveDetailPage = lazy(() => import('./pages/ArchiveDetailPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const MandantsPage = lazy(() => import('./pages/MandantsPage'));
const MandantDetailPage = lazy(() => import('./pages/MandantDetailPage'));
const LocationsPage = lazy(() => import('./pages/LocationsPage'));
const LocationDetailPage = lazy(() => import('./pages/LocationDetailPage'));
const FournisseursPage = lazy(() => import('./pages/FournisseursPage'));
const FournisseurDetailPage = lazy(() => import('./pages/FournisseurDetailPage'));
const WorkforcePage = lazy(() => import('./pages/WorkforcePage'));
const WorkforceDetailPage = lazy(() => import('./pages/WorkforceDetailPage'));
const ChauffeursPage = lazy(() => import('./pages/ChauffeursPage'));
const ChauffeurDetailPage = lazy(() => import('./pages/ChauffeurDetailPage'));
const PointagePage = lazy(() => import('./pages/PointagePage'));
const ProjetsPage = lazy(() => import('./pages/ProjetsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const BienDetailPage = lazy(() => import('./pages/BienDetailPage'));
const SalairesHubPage = lazy(() => import('./pages/SalairesHubPage'));
const SalaireDetailPage = lazy(() => import('./pages/SalaireDetailPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const AuditDetailPage = lazy(() => import('./pages/AuditDetailPage'));
const ParametresPage = lazy(() => import('./pages/ParametresPage'));
const ReferentielsPage = lazy(() => import('./pages/ReferentielsPage'));
const PaiementsPage = lazy(() => import('./pages/PaiementsPage'));
const DecaissementsPage = lazy(() => import('./pages/DecaissementsPage'));
const PaiementDetailPage = lazy(() => import('./pages/PaiementDetailPage'));
const ComptabilitePage = FEATURE_FLAGS.comptabilite
  ? lazy(() => import('./pages/ComptabilitePage'))
  : null;
const AvancementPage = lazy(() => import('./pages/AvancementPage'));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'));
const MaintenanceDetailPage = lazy(() => import('./pages/MaintenanceDetailPage'));
const MissionDetailPage = lazy(() => import('./pages/MissionDetailPage'));
const MissionsPage = lazy(() => import('./pages/MissionsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const UserDetailPage = lazy(() => import('./pages/UserDetailPage'));
const EquipeInternePage = lazy(() => import('./pages/EquipeInternePage'));
const EquipeInterneDetailPage = lazy(() => import('./pages/EquipeInterneDetailPage'));
const ReconnusPage = lazy(() => import('./pages/ReconnusPage'));
const ReconnuDetailPage = lazy(() => import('./pages/ReconnuDetailPage'));
const CaisseBureauPage = lazy(() => import('./pages/CaisseBureauPage'));
const SupplierPortalPage = lazy(() => import('./pages/SupplierPortalPage'));

function PageLoader() {
  const { t } = useI18n();
  return (
    <div className="text-[12px] text-gic-muted p-6">{t('common.loading')}</div>
  );
}

/** Legacy treasury links `/caisse/:id` → Balance */
function LegacyCaisseToBalance() {
  const { id } = useParams();
  return <Navigate to={`/balance/${id}`} replace />;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[12px] text-gic-muted">
        {t('common.loadingGic')}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <DialogProvider>
        <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/portal/login" element={<PortalLoginPage />} />
            <Route path="/portal" element={<SupplierPortalPage />} />
            <Route
              element={
                <PrivateRoute>
                  <AppLayout />
                </PrivateRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="agents/:id" element={<AgentDetailPage />} />
              <Route path="reconnus" element={<ReconnusPage />} />
              <Route path="reconnus/:id" element={<ReconnuDetailPage />} />
              <Route path="mandants" element={<MandantsPage />} />
              <Route path="mandants/:id" element={<MandantDetailPage />} />
              <Route path="projets" element={<ProjetsPage />} />
              <Route path="projets/:id" element={<ProjectDetailPage />} />
              <Route path="biens" element={<BiensPage />} />
              <Route path="biens/:id" element={<BienDetailPage />} />
              <Route path="ventes" element={<VentesPage />} />
              <Route path="ventes/:id" element={<VenteDetailPage />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="locations/:id" element={<LocationDetailPage />} />
              <Route path="encaissements" element={<PaiementsPage />} />
              <Route path="encaissements/:id" element={<PaiementDetailPage />} />
              <Route path="paiements" element={<Navigate to="/encaissements" replace />} />
              <Route path="paiements/:id" element={<PaiementDetailPage />} />
              <Route path="decaissements" element={<DecaissementsPage />} />
              <Route path="balance" element={<FinancePage />} />
              <Route path="balance/:id" element={<FinanceDetailPage />} />
              <Route path="caisse" element={<CaisseBureauPage />} />
              <Route path="caisse/:id" element={<LegacyCaisseToBalance />} />
              {ComptabilitePage && <Route path="comptabilite" element={<ComptabilitePage />} />}
              <Route path="salaires" element={<SalairesHubPage />} />
              <Route path="salaires/:id" element={<SalaireDetailPage />} />
              <Route path="avancement" element={<AvancementPage />} />
              <Route path="maintenance" element={<MaintenancePage />} />
              <Route path="maintenance/:id" element={<MaintenanceDetailPage />} />
              <Route path="missions" element={<MissionsPage />} />
              <Route path="missions/:id" element={<MissionDetailPage />} />
              <Route path="achats" element={<AchatsPage />} />
              <Route path="achats/:id" element={<AchatDetailPage />} />
              <Route path="fournisseurs" element={<FournisseursPage />} />
              <Route path="fournisseurs/:id" element={<FournisseurDetailPage />} />
              <Route path="chantiers" element={<ChantiersPage />} />
              <Route path="chantiers/:id" element={<ChantierDetailPage />} />
              <Route path="chantiers/:id/tranches/:trancheId" element={<ChantierDetailPage />} />
              <Route path="main-oeuvre" element={<WorkforcePage />} />
              <Route path="main-oeuvre/:id" element={<WorkforceDetailPage />} />
              <Route path="chauffeurs" element={<ChauffeursPage />} />
              <Route path="chauffeurs/:id" element={<ChauffeurDetailPage />} />
              <Route path="pointage" element={<PointagePage />} />
              <Route path="equipe-interne" element={<EquipeInternePage />} />
              <Route path="equipe-interne/:id" element={<EquipeInterneDetailPage />} />
              <Route path="engins" element={<EnginsPage />} />
              <Route path="engins/:id" element={<EnginDetailPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="documents/:id" element={<DocumentDetailPage />} />
              <Route path="archives/:id" element={<ArchiveDetailPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="audit/:id" element={<AuditDetailPage />} />
              <Route path="parametres" element={<ParametresPage />} />
              <Route path="referentiels" element={<ReferentielsPage />} />
              <Route path="utilisateurs" element={<UsersPage />} />
              <Route path="utilisateurs/:id" element={<UserDetailPage />} />
              <Route path="acces-refuse" element={<ForbiddenPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </BrowserRouter>
      </DialogProvider>
    </AuthProvider>
  );
}
