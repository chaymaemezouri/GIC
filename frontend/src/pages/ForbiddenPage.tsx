import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { Btn, Card } from '../components/ui';
import { useI18n } from '../i18n/I18nContext';

export default function ForbiddenPage() {
  const { t } = useI18n();
  return (
    <Card className="max-w-md mx-auto text-center py-10">
      <ShieldX size={40} className="mx-auto text-gic-coral mb-3" />
      <h1 className="text-lg font-semibold text-gic-ink mb-1">{t('auth.forbiddenTitle')}</h1>
      <p className="text-[12px] text-gic-muted mb-4">
        {t('auth.forbiddenBody')}
      </p>
      <Link to="/"><Btn variant="secondary">{t('auth.backToDashboard')}</Btn></Link>
    </Card>
  );
}
