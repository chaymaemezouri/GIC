import { useEffect, useMemo, useState } from 'react';
import { useI18n, tStatic } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';
import { api, fetchDropdownOptions, fetchProjectList } from '../lib/api';
import { Input, Select } from './ui';

const FALLBACK_PROPERTY_STATUS_VALUES = ['disponible', 'réservé', 'vendu', 'loué', 'indisponible'] as const;

type StatusOption = { value: string; label?: string };

export type BienFormData = {
  name: string;
  city: string;
  status: string;
  surface: string;
  rooms: string;
  price: string;
  projectId: string;
  floorId: string;
  titleNumber: string;
  description: string;
  contractualDesc: string;
};

export function emptyBienForm(): BienFormData {
  return {
    name: '',
    city: '',
    status: 'disponible',
    surface: '',
    rooms: '',
    price: '',
    projectId: '',
    floorId: '',
    titleNumber: '',
    description: '',
    contractualDesc: '',
  };
}

export function bienToForm(p: Record<string, unknown>): BienFormData {
  return {
    name: String(p.name || ''),
    city: String(p.city || ''),
    status: String(p.status || 'disponible'),
    surface: p.surface != null ? String(p.surface) : '',
    rooms: p.rooms != null ? String(p.rooms) : '',
    price: p.price != null ? String(p.price) : '',
    projectId: String(p.projectId || ''),
    floorId: String(p.floorId || ''),
    titleNumber: String(p.titleNumber || ''),
    description: String(p.description || ''),
    contractualDesc: String(p.contractualDesc || ''),
  };
}

export type FloorOption = { id: string; label: string };

type TreeTranche = {
  id: string;
  name: string;
  blocs?: Array<{
    id: string;
    name: string;
    lots?: Array<{
      id: string;
      name: string;
      floors?: Array<{ id: string; name: string }>;
    }>;
  }>;
};

export function flattenProjectFloors(
  project: { tranches?: TreeTranche[] },
  t: TranslateFn = tStatic,
): FloorOption[] {
  const out: FloorOption[] = [];
  for (const tr of project.tranches || []) {
    for (const b of tr.blocs || []) {
      for (const l of b.lots || []) {
        for (const f of l.floors || []) {
          out.push({
            id: f.id,
            label: t('fields.floorPath', {
              tranche: tr.name,
              bloc: b.name,
              lot: l.name,
              floor: f.name,
            }),
          });
        }
      }
    }
  }
  return out;
}

export function BienFormFields({
  form,
  setForm,
  projects: projectsProp,
  floors: floorsProp,
  loadingFloors: loadingFloorsProp,
  lockProjectId,
  lockedProjectName,
  lockFloorId,
  lockedFloorLabel,
}: {
  form: BienFormData;
  setForm: (f: BienFormData) => void;
  projects: { id: string; name: string; locationId?: string | null }[];
  floors: FloorOption[];
  loadingFloors?: boolean;
  /** Quand défini, le projet est fixé (ex. depuis une fiche projet). */
  lockProjectId?: string;
  lockedProjectName?: string;
  lockFloorId?: string;
  lockedFloorLabel?: string;
}) {
  const { t } = useI18n();
  const cascade = !lockProjectId && !lockFloorId;
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(
    () => FALLBACK_PROPERTY_STATUS_VALUES.map((value) => ({ value })),
  );
  const [locationId, setLocationId] = useState('');
  const [cascadeProjects, setCascadeProjects] = useState<{ id: string; name: string }[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [tree, setTree] = useState<TreeTranche[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [trancheId, setTrancheId] = useState('');
  const [blocId, setBlocId] = useState('');
  const [lotId, setLotId] = useState('');

  useEffect(() => {
    fetchDropdownOptions('property_status')
      .then((opts) => {
        if (opts.length > 0) {
          setStatusOptions(opts.map((o) => ({ value: o.value, label: o.label || o.value })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!cascade) return;
    api<{ id: string; name: string }[]>('/immobilier/locations')
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [cascade]);

  useEffect(() => {
    if (!cascade) return;
    if (!locationId) {
      setCascadeProjects([]);
      return;
    }
    setLoadingProjects(true);
    fetchProjectList<{ id: string; name: string }>({ locationId, limit: 500 })
      .then(setCascadeProjects)
      .catch(() => setCascadeProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [cascade, locationId]);

  useEffect(() => {
    if (!cascade) return;
    if (!form.projectId) {
      setTree([]);
      setTrancheId('');
      setBlocId('');
      setLotId('');
      return;
    }
    setLoadingTree(true);
    api<{ tranches?: TreeTranche[] }>(`/immobilier/projects/${form.projectId}/tree`)
      .then((p) => setTree(p.tranches || []))
      .catch(() => setTree([]))
      .finally(() => setLoadingTree(false));
  }, [cascade, form.projectId]);

  const projects = cascade
    ? (locationId ? cascadeProjects : projectsProp)
    : projectsProp;

  const tranches = tree;
  const blocs = useMemo(
    () => tranches.find((tr) => tr.id === trancheId)?.blocs || [],
    [tranches, trancheId],
  );
  const lots = useMemo(
    () => blocs.find((b) => b.id === blocId)?.lots || [],
    [blocs, blocId],
  );
  const cascadeFloors = useMemo(
    () => (lots.find((l) => l.id === lotId)?.floors || []).map((f) => ({
      id: f.id,
      label: f.name,
    })),
    [lots, lotId],
  );

  const floors = cascade && form.projectId ? cascadeFloors : floorsProp;
  const loadingFloors = cascade ? loadingTree : loadingFloorsProp;

  const fallbackStatusLabels: Record<string, string> = {
    disponible: t('status.available'),
    réservé: t('status.reserved'),
    vendu: t('status.sold'),
    loué: t('status.rented'),
    indisponible: t('fields.unavailable'),
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionIdentification')}</p>
      <Input className="sm:col-span-2" label={`${t('fields.nameDesignation')} *`} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input label={t('fields.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
      <Input label={t('fields.titleDeed')} value={form.titleNumber} onChange={(e) => setForm({ ...form, titleNumber: e.target.value })} />
      <Select label={t('fields.status')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>{fallbackStatusLabels[o.value] || o.label || o.value}</option>
        ))}
        {form.status && !statusOptions.some((o) => o.value === form.status) && (
          <option value={form.status}>{form.status}</option>
        )}
      </Select>

      {cascade && (
        <>
          <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">
            {t('fields.sectionHierarchy')}
          </p>
          <Select
            label={t('fields.localization')}
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setForm({ ...form, projectId: '', floorId: '' });
              setTrancheId('');
              setBlocId('');
              setLotId('');
            }}
          >
            <option value="">{t('fields.allNoFilter')}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </>
      )}

      {lockProjectId ? (
        <div>
          <label className="block text-[11px] font-medium text-gic-muted mb-1">{t('fields.project')}</label>
          <p className="rounded-xl border border-gic-border bg-gray-50/80 px-3 py-2 text-[12px] font-medium text-gic-ink">
            {lockedProjectName || projects.find((p) => p.id === lockProjectId)?.name || t('fields.thisProject')}
          </p>
        </div>
      ) : (
        <Select
          label={t('fields.project')}
          value={form.projectId}
          onChange={(e) => {
            setForm({ ...form, projectId: e.target.value, floorId: '' });
            setTrancheId('');
            setBlocId('');
            setLotId('');
          }}
          disabled={cascade && !!locationId && loadingProjects}
        >
          <option value="">{loadingProjects ? t('common.loading') : '—'}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      )}

      {cascade && form.projectId && (
        <>
          <Select
            label={t('fields.tranche')}
            value={trancheId}
            onChange={(e) => {
              setTrancheId(e.target.value);
              setBlocId('');
              setLotId('');
              setForm({ ...form, floorId: '' });
            }}
            disabled={loadingTree}
          >
            <option value="">{loadingTree ? t('common.loading') : '—'}</option>
            {tranches.map((tr) => (
              <option key={tr.id} value={tr.id}>{tr.name}</option>
            ))}
          </Select>
          <Select
            label={t('fields.bloc')}
            value={blocId}
            onChange={(e) => {
              setBlocId(e.target.value);
              setLotId('');
              setForm({ ...form, floorId: '' });
            }}
            disabled={!trancheId}
          >
            <option value="">—</option>
            {blocs.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
          <Select
            label={`${t('fields.lot')} (${t('fields.gh')})`}
            value={lotId}
            onChange={(e) => {
              setLotId(e.target.value);
              setForm({ ...form, floorId: '' });
            }}
            disabled={!blocId}
          >
            <option value="">—</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </>
      )}

      {lockFloorId ? (
        <div>
          <label className="block text-[11px] font-medium text-gic-muted mb-1">{t('fields.floorHierarchy')}</label>
          <p className="rounded-xl border border-gic-border bg-gray-50/80 px-3 py-2 text-[12px] font-medium text-gic-ink">
            {lockedFloorLabel || floors.find((f) => f.id === lockFloorId)?.label || t('fields.selectedFloor')}
          </p>
        </div>
      ) : (
        <Select
          label={t('fields.floorHierarchy')}
          value={form.floorId}
          onChange={(e) => setForm({ ...form, floorId: e.target.value })}
          disabled={!form.projectId || loadingFloors || (cascade && !lotId && cascadeFloors.length === 0 && !!form.projectId)}
        >
          <option value="">{loadingFloors ? t('common.loading') : '—'}</option>
          {(cascade ? cascadeFloors : floors).map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </Select>
      )}

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionCharacteristics')}</p>
      <Input label={t('fields.surfaceM2')} type="number" min="0" step="0.01" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} />
      <Input label={t('fields.rooms')} type="number" min="0" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} />
      <Input label={t('fields.priceMad')} type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionDescriptions')}</p>
      <Input className="sm:col-span-2" label={t('fields.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.contractualDescription')} value={form.contractualDesc} onChange={(e) => setForm({ ...form, contractualDesc: e.target.value })} />
    </div>
  );
}
