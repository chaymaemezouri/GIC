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
