import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, Info, CheckCircle2, ShoppingCart, HardHat, Wallet, FileText,
} from 'lucide-react';

export type NotificationCategory = {
  id: string;
  label: string;
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { id: '', label: 'Tous types' },
  { id: 'alert', label: 'Alertes' },
  { id: 'success', label: 'Succès' },
  { id: 'achat', label: 'Achats' },
  { id: 'chantier', label: 'Chantiers' },
  { id: 'finance', label: 'Finance' },
  { id: 'doc', label: 'Documents' },
  { id: 'info', label: 'Informations' },
];

type TypeMeta = {
  icon: LucideIcon;
  chip: string;
  tone: 'coral' | 'emerald' | 'amber' | 'orange' | 'violet' | 'sky' | 'gray';
  label: string;
};

export function getNotificationTypeMeta(type: string): TypeMeta {
  const t = (type || 'info').toLowerCase();
  if (t.includes('alert') || t.includes('error') || t.includes('retard') || t === 'warning') {
    return { icon: AlertTriangle, chip: 'mac-chip-orange', tone: 'coral', label: 'Alerte' };
  }
  if (t.includes('success') || t.includes('ok') || t.includes('valid')) {
    return { icon: CheckCircle2, chip: 'mac-chip-green', tone: 'emerald', label: 'Succès' };
  }
  if (t.includes('achat') || t.includes('purchase')) {
    return { icon: ShoppingCart, chip: 'mac-chip-orange', tone: 'amber', label: 'Achat' };
  }
  if (t.includes('chantier') || t.includes('ops')) {
    return { icon: HardHat, chip: 'mac-chip-orange', tone: 'orange', label: 'Chantier' };
  }
  if (t.includes('finance') || t.includes('paiement') || t.includes('caisse')) {
    return { icon: Wallet, chip: 'mac-chip-violet', tone: 'violet', label: 'Finance' };
  }
  if (t.includes('doc')) {
    return { icon: FileText, chip: 'mac-chip-blue', tone: 'sky', label: 'Document' };
  }
  return { icon: Info, chip: 'mac-chip-gray', tone: 'gray', label: 'Info' };
}

export function formatNotificationTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'À l’instant';
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Il y a ${d} j`;
  return new Intl.DateTimeFormat('fr-MA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatNotificationDateTime(iso: string) {
  return new Intl.DateTimeFormat('fr-MA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
