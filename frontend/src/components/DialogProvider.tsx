import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  registerDialogHandlers,
  unregisterDialogHandlers,
  type AlertOptions,
  type ConfirmOptions,
} from '../lib/dialog';
import { useI18n } from '../i18n/I18nContext';
import { Btn, Modal } from './ui';

type DialogState =
  | { kind: 'idle' }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'alert';
      title: string;
      message: string;
      okLabel: string;
      resolve: () => void;
    };

function DialogMessage({ message }: { message: string }) {
  return <p className="text-[13px] text-gic-ink leading-relaxed whitespace-pre-line">{message}</p>;
}

export default function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<DialogState>({ kind: 'idle' });

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setState({
        kind: 'confirm',
        title: options.title ?? t('dialog.confirmTitle'),
        message,
        confirmLabel: options.confirmLabel ?? t('common.confirm'),
        cancelLabel: options.cancelLabel ?? t('common.cancel'),
        danger: options.danger ?? false,
        resolve,
      });
    });
  }, [t]);

  const alert = useCallback((message: string, options: AlertOptions = {}) => {
    return new Promise<void>((resolve) => {
      setState({
        kind: 'alert',
        title: options.title ?? t('dialog.infoTitle'),
        message,
        okLabel: options.okLabel ?? t('common.ok'),
        resolve,
      });
    });
  }, [t]);

  useEffect(() => {
    registerDialogHandlers({ confirm, alert });
    return unregisterDialogHandlers;
  }, [confirm, alert]);

  function closeConfirm(result: boolean) {
    if (state.kind !== 'confirm') return;
    state.resolve(result);
    setState({ kind: 'idle' });
  }

  function closeAlert() {
    if (state.kind !== 'alert') return;
    state.resolve();
    setState({ kind: 'idle' });
  }

  return (
    <>
      {children}
      <Modal
        open={state.kind === 'confirm'}
        title={state.kind === 'confirm' ? state.title : ''}
        onClose={() => closeConfirm(false)}
        footer={
          state.kind === 'confirm' ? (
            <>
              <Btn variant="secondary" onClick={() => closeConfirm(false)}>{state.cancelLabel}</Btn>
              <Btn variant={state.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)}>
                {state.confirmLabel}
              </Btn>
            </>
          ) : undefined
        }
      >
        {state.kind === 'confirm' && <DialogMessage message={state.message} />}
      </Modal>
      <Modal
        open={state.kind === 'alert'}
        title={state.kind === 'alert' ? state.title : ''}
        onClose={closeAlert}
        footer={
          state.kind === 'alert' ? (
            <Btn onClick={closeAlert}>{state.okLabel}</Btn>
          ) : undefined
        }
      >
        {state.kind === 'alert' && <DialogMessage message={state.message} />}
      </Modal>
    </>
  );
}
