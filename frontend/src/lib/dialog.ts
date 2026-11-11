export type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type AlertOptions = {
  title?: string;
  okLabel?: string;
};

type ConfirmHandler = (message: string, options?: ConfirmOptions) => Promise<boolean>;
type AlertHandler = (message: string, options?: AlertOptions) => Promise<void>;

let confirmHandler: ConfirmHandler | null = null;
let alertHandler: AlertHandler | null = null;

export function registerDialogHandlers(handlers: {
  confirm: ConfirmHandler;
  alert: AlertHandler;
}) {
  confirmHandler = handlers.confirm;
  alertHandler = handlers.alert;
}

export function unregisterDialogHandlers() {
  confirmHandler = null;
  alertHandler = null;
}

export async function appConfirm(message: string, options?: ConfirmOptions): Promise<boolean> {
  if (confirmHandler) return confirmHandler(message, options);
  return false;
}

export async function appAlert(message: string, options?: AlertOptions): Promise<void> {
  if (alertHandler) await alertHandler(message, options);
}

export function isCinDuplicateError(err: unknown) {
  if (!err || typeof err !== 'object') return false;
  const data = (err as { data?: { code?: string } }).data;
  if (data?.code === 'CIN_DUPLICATE') return true;
  return err instanceof Error && /CIN en double/i.test(err.message);
}

/** Popup : le CIN saisi existe déjà. */
export async function alertCinDuplicate(err: unknown) {
  if (!isCinDuplicateError(err)) return false;
  const message = err instanceof Error && err.message ? err.message : 'CIN en double, il existe déjà.';
  await appAlert(message, { title: 'CIN en double' });
  return true;
}

export async function alertCinDuplicateLines(errors: string[] | undefined) {
  const hits = (errors || []).filter((line) => /CIN en double/i.test(line));
  if (!hits.length) return false;
  await appAlert(hits.join('\n\n'), { title: 'CIN en double' });
  return true;
}
