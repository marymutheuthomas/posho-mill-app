import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="mill-card p-12 text-center bg-white border-slate-200 shadow-xl">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Component Load Error</h2>
          <p className="text-sm text-slate-500 uppercase font-bold tracking-tight mb-8">This section failed to initialize correctly.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="flex items-center gap-2 mx-auto text-slate-900 font-black uppercase text-[10px] tracking-widest hover:text-mill-primary transition-colors"
          >
            <RefreshCcw size={14} />
            Reload Module
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
