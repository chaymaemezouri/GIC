import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { supplierApi, setSupplierToken, getSupplierToken } from '../lib/api';
import { GIC_DEMO_ACCOUNTS } from '../lib/companyBrand';
import { Btn, Card, Input } from '../components/ui';
import EccBrandFooter from '../components/EccBrandFooter';
import { useI18n } from '../i18n/I18nContext';

export default function PortalLoginPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(!!getSupplierToken());

  if (ok) return <Navigate to="/portal" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await supplierApi<{ token: string }>('/auth/supplier/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSupplierToken(res.token);
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const supplierDemo = GIC_DEMO_ACCOUNTS.find((a) => a.portal === 'fournisseur');

  return (
    <div className="login-page">
      <div className="login-page-inner">
        <div className="login-page-brand">
          <div className="login-gic-icon" style={{ background: 'linear-gradient(145deg, #34c759 0%, #248a3d 100%)', boxShadow: '0 8px 24px rgba(52, 199, 89, 0.22)' }}>
            <Building2 size={24} strokeWidth={2} />
          </div>
          <h1 className="login-gic-title">{t('pages.supplierPortal')}</h1>
          <p className="login-gic-subtitle">{t('auth.portalSubtitle')}</p>
        </div>
        <Card className="login-card">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input label={t('common.email')} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label={t('auth.password')} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-[11px] text-gic-coral">{error}</p>}
            <Btn type="submit" className="w-full">{t('auth.login')}</Btn>
          </form>
          {supplierDemo && (
            <p className="text-[10px] text-gic-muted text-center mt-4">
              {t('auth.demoPrefix')} : {supplierDemo.email} / {supplierDemo.password}
            </p>
          )}
        </Card>
        <div className="login-page-foot">
          <a href="/login" className="login-portal-link">← {t('auth.backToInternal')}</a>
          <EccBrandFooter variant="login" />
        </div>
      </div>
    </div>
  );
}
