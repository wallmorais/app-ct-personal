import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PT.Control] Erro não tratado:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen min-h-[100dvh] bg-base-bg flex items-center justify-center px-5">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <span className="text-3xl" role="img" aria-label="Erro">⚠️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Algo deu errado</h1>
              <p className="text-sm text-base-muted mt-2">
                O aplicativo encontrou um erro inesperado. Recarregue a página para continuar.
              </p>
              {this.state.error && (
                <p className="text-xs text-base-muted/60 mt-2 font-mono bg-base-surface border border-base-border rounded-xl px-3 py-2 text-left break-all">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl bg-emerald text-black text-sm font-semibold active:bg-emerald/80"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
