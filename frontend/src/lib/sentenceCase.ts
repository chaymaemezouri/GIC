/** Première lettre en majuscule, tout le reste en minuscule. */
export function toSentenceCase(value: string): string {
  const lower = value.toLocaleLowerCase('fr-FR');
  const match = /\p{L}/u.exec(lower);
  if (!match || match.index == null) return lower;
  const i = match.index;
  return lower.slice(0, i) + lower.charAt(i).toLocaleUpperCase('fr-FR') + lower.slice(i + 1);
}

const SKIP_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'email',
  'file',
  'hidden',
  'image',
  'month',
  'number',
  'password',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'url',
  'week',
]);

function isTextControl(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !SKIP_TYPES.has((el.type || 'text').toLowerCase());
}

function shouldFormat(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el.readOnly || el.disabled) return false;
  if (el.dataset.keepCase != null) return false;
  if (el.closest('[data-keep-case]')) return false;
  const auto = (el.autocomplete || '').toLowerCase();
  if (auto === 'one-time-code' || auto === 'current-password' || auto === 'new-password' || auto === 'username') return false;
  return true;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function applySentenceCase(el: HTMLInputElement | HTMLTextAreaElement) {
  const next = toSentenceCase(el.value);
  if (next === el.value) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  // Le setter natif laisse le suivi de valeur de React détecter le changement.
  setNativeValue(el, next);
  if (start != null && end != null) {
    const pos = Math.min(start, next.length);
    const endPos = Math.min(end, next.length);
    try {
      el.setSelectionRange(pos, endPos);
    } catch {
      /* certains types n'acceptent pas de sélection */
    }
  }
}

const LISTENER_KEY = '__gicSentenceCase';

/** Formate toutes les saisies texte du document, y compris les champs hors composant Input. */
export function installSentenceCase() {
  if (typeof document === 'undefined') return;
  const host = window as Window & { [LISTENER_KEY]?: (event: Event) => void };
  if (host[LISTENER_KEY]) {
    document.removeEventListener('input', host[LISTENER_KEY], true);
    document.removeEventListener('compositionend', host[LISTENER_KEY], true);
  }

  const onEdit = (event: Event) => {
    if ((event as InputEvent).isComposing) return;
    const el = event.target;
    if (!isTextControl(el) || !shouldFormat(el)) return;
    applySentenceCase(el);
  };

  host[LISTENER_KEY] = onEdit;
  document.addEventListener('input', onEdit, true);
  document.addEventListener('compositionend', onEdit, true);
}
