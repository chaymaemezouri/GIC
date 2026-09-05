import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Btn } from './ui';

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[GIC page error]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mac-panel p-6 max-w-lg">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] mb-1">
            Impossible d’afficher cette page
          </h2>
          <p className="text-[12px] text-gic-muted mb-3">
            Une erreur a interrompu le rendu. Rechargez la page ou revenez à l’accueil.
          </p>
          <p className="text-[11px] text-gic-coral mb-4 font-mono break-all">
            {this.state.error.message}
          </p>
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => window.location.assign('/')}>
              Accueil
            </Btn>
            <Btn onClick={() => window.location.reload()}>Recharger</Btn>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
