import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

const root = document.getElementById('root')!;

createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
