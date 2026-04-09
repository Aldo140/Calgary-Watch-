import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'An unexpected error occurred.';
      try {
        const parsedError = JSON.parse(this.state.error?.message || '');
        if (parsedError.error) {
          errorMessage = parsedError.error;
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950 z-[9999]">
          <Card className="max-w-md w-full p-8 bg-white/90 backdrop-blur-2xl border-red-100 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              {errorMessage}
            </p>
            <Button
              variant="primary"
              className="w-full flex items-center gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={18} />
              Reload Application
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
