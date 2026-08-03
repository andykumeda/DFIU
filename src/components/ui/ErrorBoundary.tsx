import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

const CHUNK_RELOAD_KEY = `dfiu:chunk-reload:${__COMMIT_HASH__}`

function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message)
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

    if (!isChunkLoadError(error)) return

    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
      sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true')
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }

  public render() {
    if (this.state.hasError) {
      const chunkError = this.state.error ? isChunkLoadError(this.state.error) : false
      return (
        <div className='min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-8'>
          <h1 className='text-3xl font-bold text-red-500 mb-4'>Something went wrong</h1>
          <pre className='bg-neutral-900 p-4 rounded-lg border border-neutral-800 text-sm text-neutral-300 overflow-auto max-w-full'>
            {this.state.error?.message}
          </pre>
          {chunkError && (
            <p className='mt-4 max-w-md text-center text-sm text-neutral-400'>
              A new version may have been deployed. Reloading usually fixes this.
            </p>
          )}
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
