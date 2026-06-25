import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="glass-panel rounded-2xl p-8 max-w-lg w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-brand-red" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold font-mono text-red-400">Unexpected Error</h2>
              <p className="text-sm text-slate-400">
                {this.props.fallback || 'Something went wrong. Please try again.'}
              </p>
            </div>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-green hover:bg-emerald-600 text-bg-dark font-bold rounded-xl transition-all"
            >
              <RefreshCw className="w-4 h-4" /> Return Home
            </button>
            {this.state.error && (
              <details className="text-left text-xs text-slate-500 border-t border-slate-800 pt-4 mt-4">
                <summary className="cursor-pointer font-mono">Error Details</summary>
                <pre className="mt-2 p-3 bg-black/30 rounded-lg overflow-auto max-h-32 text-red-300 font-mono text-[10px]">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
