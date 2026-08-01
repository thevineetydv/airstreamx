// ============================================================
// ErrorBoundary.tsx — React Error Boundary
// Catches React rendering errors and displays fallback UI
// ============================================================

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logger } from "../utils/logger";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

/**
 * Error boundary to catch React rendering errors
 * Displays user-friendly error message and recovery options
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, _errorInfo: React.ErrorInfo): void {
    logger.error(
      "ErrorBoundary",
      `React rendering error caught: ${error.message}`,
      error
    );

    // Update error count
    this.setState((prev) => ({
      errorCount: prev.errorCount + 1,
    }));

    // If too many errors, might indicate systemic issue
    if (this.state.errorCount > 5) {
      logger.warn(
        "ErrorBoundary",
        "Multiple errors detected - potential system issue"
      );
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
    // Optionally redirect to home
    // window.location.href = "/";
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-xl p-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-red-500/10 p-4 rounded-full">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">Oops! Something Went Wrong</h1>
              <p className="text-gray-400 mb-2 text-sm">
                We encountered an unexpected error. Please try again.
              </p>

              {process.env.NODE_ENV === "development" && this.state.error && (
                <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-700 text-left">
                  <p className="text-xs font-mono text-red-300 break-all">{this.state.error.toString()}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={this.handleReset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
                <button
                  onClick={() => (window.location.href = "/")}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-all"
                >
                  Go Home
                </button>
              </div>

              <p className="text-xs text-gray-400 mt-4">
                Error ID: {Date.now()} • Error count: {this.state.errorCount}
              </p>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
