import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessRoute } from '../lib/permissions';
import { useI18n } from '../i18n/I18nContext';
import ForbiddenPage from '../pages/ForbiddenPage';

export default function RoleRoute({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="text-[12px] text-gic-muted p-6">{t('msg.loading')}</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessRoute(user.role, location.pathname)) {
    return <ForbiddenPage />;
  }
  return children;
}
