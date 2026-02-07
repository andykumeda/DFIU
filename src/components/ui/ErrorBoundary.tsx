import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className='min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-8'>
          <h1 className='text-3xl font-bold text-red-500 mb-4'>Something went wrong</h1>
          <pre className='bg-neutral-900 p-4 rounded-lg border border-neutral-800 text-sm text-neutral-300 overflow-auto max-w-full'>
            {this.state.error?.message}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className='mt-6 bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-semibold transition-colors'
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
