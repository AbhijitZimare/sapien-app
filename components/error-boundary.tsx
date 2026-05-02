'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            className="flex min-h-screen items-center justify-center p-6"
            style={{ background: '#F4F4F4' }}
            role="alert"
            aria-live="assertive"
          >
            <div className="max-w-sm text-center">
              <AlertTriangle
                size={48}
                aria-hidden="true"
                style={{ color: '#F0A500', margin: '0 auto 16px' }}
              />
              <h1
                className="mb-2 text-2xl font-medium"
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  color: '#0D1B2A',
                }}
              >
                Something went wrong
              </h1>
              <p
                className="mb-6 text-sm"
                style={{
                  color: '#9B9BAD',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Please refresh the page. If the problem persists, contact support.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[44px] rounded-xl px-6 py-3 text-sm font-medium text-white"
                style={{
                  background: '#0D1B2A',
                  fontFamily: 'DM Sans, sans-serif',
                }}
                aria-label="Reload page"
              >
                Reload page
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
