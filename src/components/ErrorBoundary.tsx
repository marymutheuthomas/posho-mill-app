import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { btn } from '../lib/ui';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  // Changing this clears the error, e.g. the active tab, so navigating away recovers.
  resetKey?: string;
  label?: string;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  public render() {
    const { error } = this.state;
    if (error) {
      return this.props.fallback || (
        <div className="mill-card p-8 md:p-12 text-center bg-white border-slate-200 shadow-xl max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">
            {this.props.label ? `${this.props.label} failed to load` : 'Something went wrong'}
          </h2>
          <p className="text-sm text-slate-500 font-bold tracking-tight mb-4">
            Other screens still work from the menu. Please send this message to support:
          </p>
          {/* Shown on purpose: a readable error beats a blank screen when diagnosing in the field */}
          <pre className="text-left text-xs font-mono text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 mb-8 whitespace-pre-wrap break-words max-h-48 overflow-auto">
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack.split('\n').slice(1, 6).join('\n')}` : ''}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className={`${btn.primary} mx-auto`}
          >
            <RefreshCcw size={14} />
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
