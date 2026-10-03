import { useEffect, useState } from 'react';
import { api, fetchChantierList } from '../lib/api';
import { Card, MacSelect, MacToolbarTabs, PageHeader } from '../components/ui';
import { AssignmentsPanel } from '../components/engins/Assignments';
import { MaterielStockPanel } from '../components/engins/MaterielStockPanel';
import { ChantierWorkersHub } from '../components/ChantierWorkersHub';
import { CHAUFFEUR_CATEGORY } from '../lib/workforceScope';
import { useI18n } from '../i18n/I18nContext';
import type { SiteAssignment } from '../components/ChantierWorkersPanel';

type Action = 'affectation' | 'transfert' | 'desaffectation';
type Resource = 'engin' | 'materiel' | 'personnel' | 'chauffeur';

const TITLES: Record<Action, string> = {
  affectation: 'nav.opsAssign',
  transfert: 'nav.opsTransfer',
  desaffectation: 'nav.opsUnassign',
};

const SUBTITLES: Record<Action, string> = {
  affectation: 'pages.opsAssignSubtitle',
  transfert: 'pages.opsTransferSubtitle',
  desaffectation: 'pages.opsUnassignSubtitle',
};

export default function OperationsMouvementsPage({ action }: { action: Action }) {
  const { t } = useI18n();
  const [resource, setResource] = useState<Resource>('engin');
  const [chantierId, setChantierId] = useState('');
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [assignments, setAssignments] = useState<SiteAssignment[]>([]);
  const [tranches, setTranches] = useState<string[]>([]);

  useEffect(() => {
    fetchChantierList<{ id: string; name: string }>().then(setChantiers).catch(() => setChantiers([]));
  }, []);

  function loadPersonnel() {
    if (!chantierId) {
      setAssignments([]);
      setTranches([]);
      return;
    }
    Promise.all([
      api<{ assignments?: SiteAssignment[]; tranches?: { name: string }[] }>(`/chantiers/${chantierId}`),
      api<{ id: string; name: string }[]>(`/chantiers/${chantierId}/tranches`).catch(() => []),
    ]).then(([detail, tr]) => {
      setAssignments(detail.assignments || []);
      const names = (Array.isArray(tr) ? tr : []).map((row) => row.name).filter(Boolean);
      setTranches(names.length ? names : (detail.tranches || []).map((row) => row.name).filter(Boolean));
    }).catch(() => {
      setAssignments([]);
      setTranches([]);
    });
  }

  useEffect(() => {
    if (resource === 'personnel' || resource === 'chauffeur') loadPersonnel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId, resource]);

  const workerRows = assignments.filter((a) => a.workforce?.category !== CHAUFFEUR_CATEGORY);
  const driverRows = assignments.filter((a) => a.workforce?.category === CHAUFFEUR_CATEGORY);
  const hubSection = action === 'transfert' ? 'transfer' : 'affectation';
  const materielType = action === 'transfert' ? 'transfert' : action === 'desaffectation' ? 'desaffectation' : 'affectation';

  return (
    <div className="space-y-0">
      <PageHeader mac title={t(TITLES[action])} subtitle={t(SUBTITLES[action])} />
      <Card className="mb-4 !pb-0">
        <MacToolbarTabs
          scopeLabel={t('fields.type')}
          scopeTabs={[
            { id: 'engin', label: t('tabs.equipment') },
            { id: 'materiel', label: t('tabs.materiel') },
            { id: 'personnel', label: t('nav.workforce') },
            { id: 'chauffeur', label: t('nav.drivers') },
          ]}
          scope={resource}
          onScopeChange={(id) => setResource(id as Resource)}
        />
      </Card>

      {resource === 'engin' && (
        <AssignmentsPanel
          toolbar
          showKpis
          lockKind="engin"
          initialStatus="actifs"
          returnFocus={action === 'desaffectation'}
        />
      )}

      {resource === 'materiel' && <MaterielStockPanel defaultType={materielType} />}

      {(resource === 'personnel' || resource === 'chauffeur') && (
        <div className="space-y-3">
          <MacSelect
            value={chantierId}
            onChange={setChantierId}
            className="w-64"
            options={[{ value: '', label: t('msg.chooseSite') }, ...chantiers.map((c) => ({ value: c.id, label: c.name }))]}
          />
          {chantierId ? (
            <ChantierWorkersHub
              chantierId={chantierId}
              assignments={resource === 'chauffeur' ? driverRows : workerRows}
              tranches={tranches}
              scope={resource === 'chauffeur' ? 'drivers' : 'workers'}
              onlySection={hubSection}
              onChanged={loadPersonnel}
            />
          ) : (
            <p className="py-8 text-center text-[12px] text-gic-muted">{t('msg.chooseSite')}</p>
          )}
        </div>
      )}
    </div>
  );
}
