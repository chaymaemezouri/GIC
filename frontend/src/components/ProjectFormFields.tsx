import { useState } from 'react';
import { ExternalLink, MapPin, Plus } from 'lucide-react';
import { useI18n, tStatic } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';
import { api } from '../lib/api';
import { Btn, Input, Modal, Select, Textarea } from './ui';
import { ClientFormPicker } from './ClientFormPicker';
import { googleMapsSearchUrl } from '../lib/googleMaps';

export type ProjectOwnershipType = 'personnel' | 'client';

export const PROJECT_OWNERSHIP_KEYS: Record<ProjectOwnershipType, string> = {
  personnel: 'fields.ownershipPersonal',
  client: 'fields.forClient',
};

export function projectOwnershipLabel(type: string | null | undefined, t: TranslateFn = tStatic): string {
  const key = type === 'client' ? 'client' : 'personnel';
  return t(PROJECT_OWNERSHIP_KEYS[key]);
}

/** @deprecated Prefer projectOwnershipLabel(type, t) */
export const PROJECT_OWNERSHIP_LABELS: Record<ProjectOwnershipType, string> = {
  get personnel() { return tStatic('fields.ownershipPersonal'); },
  get client() { return tStatic('fields.forClient'); },
};

export type ClientOption = {
  id: string;
  firstName: string;
  lastName: string;
  reference: string;
};

export type ProjectFormData = {
  ownershipType: ProjectOwnershipType;
  clientId: string;
  name: string;
  city: string;
  address: string;
  description: string;
  remark: string;
  locationId: string;
  status: string;
};

export function emptyProjectForm(): ProjectFormData {
  return {
    ownershipType: 'personnel',
    clientId: '',
    name: '',
    city: '',
    address: '',
    description: '',
    remark: '',
    locationId: '',
    status: 'actif',
  };
}

function normalizeOwnershipType(v: unknown): ProjectOwnershipType {
  return String(v || 'personnel').trim().toLowerCase() === 'client' ? 'client' : 'personnel';
}

export function projectToForm(p: Record<string, unknown>): ProjectFormData {
  const client = p.client as { id?: string } | null | undefined;
  return {
    ownershipType: normalizeOwnershipType(p.ownershipType),
    clientId: String(p.clientId || client?.id || ''),
    name: String(p.name || ''),
    city: String(p.city || ''),
    address: String(p.address || ''),
    description: String(p.description || ''),
    remark: String(p.remark || ''),
    locationId: String(p.locationId || ''),
    status: String(p.status || 'actif'),
  };
}

export function projectFormToBody(f: ProjectFormData) {
  const ownershipType = normalizeOwnershipType(f.ownershipType);
  return {
    ownershipType,
    clientId: ownershipType === 'client' ? f.clientId || null : null,
    name: f.name,
    city: f.city || null,
    address: f.address || null,
    description: f.description || null,
    remark: f.remark || null,
    locationId: f.locationId || null,
    status: f.status || 'actif',
  };
}

export function clientOptionLabel(c: ClientOption) {
  return `${c.firstName} ${c.lastName} (${c.reference})`;
}

type LocationOption = { id: string; name: string; city?: string | null };

export function ProjectFormFields({
  form,
  setForm,
  locations,
  onLocationCreated,
}: {
  form: ProjectFormData;
  setForm: (f: ProjectFormData) => void;
  locations: LocationOption[];
  onLocationCreated?: (loc: LocationOption) => void;
}) {
  const { t } = useI18n();
  const [createdLocations, setCreatedLocations] = useState<LocationOption[]>([]);
  const [locOpen, setLocOpen] = useState(false);
  const [locForm, setLocForm] = useState({ name: '', city: '', description: '' });
  const [locError, setLocError] = useState('');
  const [locSaving, setLocSaving] = useState(false);
  const allLocations = [
    ...locations,
    ...createdLocations.filter((c) => !locations.some((l) => l.id === c.id)),
  ].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLocError('');
    setLocSaving(true);
    try {
      const loc = await api<LocationOption>('/immobilier/locations', {
        method: 'POST',
        body: JSON.stringify(locForm),
      });
      setCreatedLocations((prev) => [...prev, loc]);
      onLocationCreated?.(loc);
      setForm({ ...form, locationId: loc.id });
      setLocOpen(false);
    } catch (err) {
      setLocError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLocSaving(false);
    }
  }
  const isClient = form.ownershipType === 'client';
  const mapsQuery = [form.address, form.city, form.name].filter(Boolean).join(', ');
  const mapsUrl = mapsQuery ? googleMapsSearchUrl(mapsQuery) : '';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label={t('fields.projectType')}
        value={form.ownershipType}
        onChange={(e) => {
          const ownershipType = normalizeOwnershipType(e.target.value);
          setForm({
            ...form,
            ownershipType,
            clientId: ownershipType === 'personnel' ? '' : form.clientId,
          });
        }}
      >
        <option value="personnel">{t('fields.ownershipPersonal')}</option>
        <option value="client">{t('fields.forClient')}</option>
      </Select>
      {isClient && (
        <div className="sm:col-span-2">
          <ClientFormPicker
            value={form.clientId}
            onChange={(clientId) => setForm({ ...form, clientId })}
            required
          />
        </div>
      )}
      <Input
        className="sm:col-span-2"
        label={`${t('fields.projectName')} *`}
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Input label={t('fields.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
      <div className="flex items-end gap-2">
        <Select
          className="flex-1"
          label={t('fields.geoZone')}
          value={form.locationId}
          onChange={(e) => setForm({ ...form, locationId: e.target.value })}
        >
          <option value="">{t('fields.noneFeminine')}</option>
          {allLocations.map((l) => (
            <option key={l.id} value={l.id}>{l.city ? `${l.name} — ${l.city}` : l.name}</option>
          ))}
        </Select>
        <Btn
          type="button"
          variant="secondary"
          title={t('inline.newLocation')}
          onClick={() => {
            setLocForm({ name: '', city: form.city, description: '' });
            setLocError('');
            setLocOpen(true);
          }}
        >
          <Plus size={14} />
        </Btn>
      </div>
      <Modal
        open={locOpen}
        title={t('inline.newLocation')}
        onClose={() => setLocOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setLocOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="inline-location-form" type="submit" disabled={locSaving}>
              {locSaving ? t('inline.saving') : t('inline.createAndSelect')}
            </Btn>
          </>
        }
      >
        <form id="inline-location-form" onSubmit={saveLocation} className="grid gap-3">
          <Input
            label={`${t('fields.name')} *`}
            required
            autoFocus
            value={locForm.name}
            onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
          />
          <Input
            label={t('fields.city')}
            value={locForm.city}
            onChange={(e) => setLocForm({ ...locForm, city: e.target.value })}
          />
          <Textarea
            label={t('fields.description')}
            rows={2}
            value={locForm.description}
            onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
          />
          {locError && <p className="text-[11px] text-gic-coral">{locError}</p>}
        </form>
      </Modal>
      <div className="sm:col-span-2">
        <label className="block text-[11px] font-medium text-gic-muted mb-1">
          {t('fields.projectAddress')}
        </label>
        <div className="flex gap-2 items-start">
          <textarea
            className="flex-1 min-h-[72px] rounded-xl border border-gic-border px-3 py-2 text-[12px] resize-y"
            placeholder={t('fields.projectAddressPlaceholder')}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="mac-maps-btn shrink-0"
              title={t('fields.openInMaps')}
            >
              <MapPin size={16} strokeWidth={2.2} />
              <span>Maps</span>
              <ExternalLink size={11} className="opacity-70" />
            </a>
          ) : (
            <span className="mac-maps-btn mac-maps-btn-disabled shrink-0" title={t('fields.enterAddressForMaps')}>
              <MapPin size={16} strokeWidth={2.2} />
              <span>Maps</span>
            </span>
          )}
        </div>
        <p className="text-[10px] text-gic-muted mt-1">
          {t('msg.projectAddressManualHint')}
        </p>
      </div>
      <Select label={t('fields.status')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        <option value="actif">{t('status.active')}</option>
        <option value="en_cours">{t('fields.statusInProgress')}</option>
        <option value="termine">{t('fields.statusFinished')}</option>
        <option value="inactif">{t('status.inactive')}</option>
      </Select>
      <Textarea
        className="sm:col-span-2"
        label={t('fields.description')}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={3}
      />
      <Textarea
        className="sm:col-span-2"
        label={t('fields.remark')}
        value={form.remark}
        onChange={(e) => setForm({ ...form, remark: e.target.value })}
        rows={2}
      />
    </div>
  );
}
