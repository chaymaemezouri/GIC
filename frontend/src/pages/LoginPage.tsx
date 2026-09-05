import { appAlert } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Building2, Lock, Mail, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { GIC_DEMO_ACCOUNTS } from '../lib/companyBrand';
import { Btn, Card, Input } from '../components/ui';
import EccBrandFooter from '../components/EccBrandFooter';
import { useI18n } from '../i18n/I18nContext';

export default function LoginPage() {
  const { user, login, verify2FA, loading } = useAuth();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const resetToken = searchParams.get('reset') || '';

  const [email, setEmail] = useState('admin@gic.ma');
  const [password, setPassword] = useState('Admin@2026');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [step2FA, setStep2FA] = useState(false);
  const [pendingToken, setPendingToken] = useState('');
  const [code2FA, setCode2FA] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (resetToken) setForgotOpen(false);
  }, [resetToken]);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await login(email, password);
      if ('requires2FA' in res && res.requires2FA) {
        setPendingToken(res.pendingToken);
        setStep2FA(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handle2FA(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await verify2FA(pendingToken, code2FA);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotMsg('');
    setSubmitting(true);
    try {
      const res = await api<{ message?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotMsg(res.message || t('auth.forgotEmailSent'));
    } catch (err) {
      setForgotMsg(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      setSearchParams({});
      setNewPassword('');
      setConfirmPassword('');
      await appAlert(t('auth.passwordUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.invalidResetLink'));
    } finally {
      setSubmitting(false);
    }
  }

  const internalDemos = GIC_DEMO_ACCOUNTS.filter((a) => a.portal === 'interne');

  return (
    <div className="login-page">
      <div className="login-page-inner">
        <div className="login-page-brand">
          <div className="login-gic-icon">
            <Building2 size={24} strokeWidth={2} />
          </div>
          <h1 className="login-gic-title">GIC</h1>
          <p className="login-gic-subtitle">{t('auth.subtitle')}</p>
        </div>
        <Card className="login-card">
          {resetToken ? (
            <form onSubmit={handleReset} className="space-y-3">
              <p className="text-[12px] font-medium">{t('auth.newPassword')}</p>
              <Input label={t('auth.password')} type="password" minLength={6} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Input label={t('auth.confirmPassword')} type="password" minLength={6} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              {error && <p className="text-[11px] text-gic-coral">{error}</p>}
              <Btn type="submit" className="w-full" disabled={submitting}>
                {submitting ? t('auth.saving') : t('auth.reset')}
              </Btn>
              <Btn type="button" variant="ghost" className="w-full" onClick={() => setSearchParams({})}>
                {t('auth.backToLogin')}
              </Btn>
            </form>
          ) : forgotOpen ? (
            <form onSubmit={handleForgot} className="space-y-3">
              <p className="text-[12px] text-gic-muted">{t('auth.forgotHint')}</p>
              <Input label={t('common.email')} type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              {forgotMsg && <p className="text-[11px] text-gic-emerald">{forgotMsg}</p>}
              <Btn type="submit" className="w-full" disabled={submitting}>
                {submitting ? t('auth.sending') : t('auth.sendLink')}
              </Btn>
              <Btn type="button" variant="ghost" className="w-full" onClick={() => { setForgotOpen(false); setForgotMsg(''); }}>
                {t('auth.backToLogin')}
              </Btn>
            </form>
          ) : !step2FA ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input label={t('auth.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {error && <p className="text-[11px] text-gic-coral">{error}</p>}
              <Btn type="submit" className="w-full mt-2" disabled={submitting}>
                {submitting ? t('auth.signingIn') : t('auth.signIn')}
              </Btn>
              <Btn type="button" variant="ghost" className="w-full text-[11px]" onClick={() => { setForgotOpen(true); setForgotEmail(email); }}>
                {t('auth.forgotPassword')}
              </Btn>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-3">
              <div className="flex items-center gap-2 text-gic-violet mb-2">
                <Shield size={18} />
                <span className="text-[12px] font-medium">{t('auth.twoFaTitle')}</span>
              </div>
              <Input
                label={t('auth.twoFaCode')}
                value={code2FA}
                onChange={(e) => setCode2FA(e.target.value)}
                maxLength={6}
                required
                autoFocus
              />
              {error && <p className="text-[11px] text-gic-coral">{error}</p>}
              <Btn type="submit" className="w-full" disabled={submitting}>
                {t('common.validate')}
              </Btn>
              <Btn type="button" variant="ghost" className="w-full" onClick={() => setStep2FA(false)}>
                {t('common.back')}
              </Btn>
            </form>
          )}
          {!step2FA && !forgotOpen && !resetToken && (
            <>
              <p className="text-[10px] text-gic-muted text-center mt-4 flex items-center justify-center gap-3">
                <span className="inline-flex items-center gap-1"><Mail size={11} /> admin@gic.ma</span>
                <span className="inline-flex items-center gap-1"><Lock size={11} /> Admin@2026</span>
              </p>
              <details className="login-demo-accounts">
                <summary>{t('auth.demoAccounts')}</summary>
                <table className="login-demo-table">
                  <thead>
                    <tr>
                      <th>{t('auth.role')}</th>
                      <th>{t('common.email')}</th>
                      <th>{t('auth.password')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {internalDemos.map((a) => (
                      <tr key={a.email}>
                        <td>{a.label}</td>
                        <td>{a.email}</td>
                        <td>{a.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </Card>
        <div className="login-page-foot">
          <EccBrandFooter variant="login" />
        </div>
      </div>
    </div>
  );
}
