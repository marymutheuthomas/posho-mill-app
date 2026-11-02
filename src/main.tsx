import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import DatabaseHealth from './components/DatabaseHealth'
import ErrorBoundary from './components/ErrorBoundary'
import './lib/offlineSync'; // Activate background sync listeners

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Last line of defence: any crash outside a screen shows its error instead of a blank page */}
      <ErrorBoundary>
        <div className="min-h-screen bg-slate-50">
          <DatabaseHealth>
            <App />
          </DatabaseHealth>
        </div>
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
