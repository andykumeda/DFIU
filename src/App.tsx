import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function Home() {
  return (
    <div className='min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4'>
      <h1 className='text-4xl font-bold mb-4'>Don't F* It Up! (Vite SPA)</h1>
      <p className='text-neutral-400'>Architecture migration in progress...</p>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<Home />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
