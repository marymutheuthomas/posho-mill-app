import React, { useEffect, useState } from 'react';
import { supabase, supabaseUrl, supabaseKey } from '../lib/supabase';
import { Database, RefreshCw } from 'lucide-react';

interface DatabaseHealthProps {
  children: React.ReactNode;
}

export default function DatabaseHealth({ children }: DatabaseHealthProps) {
  const [status, setStatus] = useState<'checking' | 'healthy' | 'error'>('checking');
  const [errorDetails, setErrorDetails] = useState<{ type: string; message: string; details?: string } | null>(null);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    setStatus('checking');
    setErrorDetails(null);

    // 1. Check for missing config
    if (!supabaseUrl || supabaseUrl.trim() === '') {
      setErrorDetails({
        type: 'Configuration Error',
        message: 'Supabase URL is missing.',
        details: 'Please check your environment variables or supabase.ts configuration.'
      });
      setStatus('error');
      return;
    }

    if (!supabaseKey || supabaseKey.trim() === '') {
      setErrorDetails({
        type: 'Configuration Error',
        message: 'Supabase Key is missing.',
        details: 'Please check your environment variables or supabase.ts configuration.'
      });
      setStatus('error');
      return;
    }

    // 2. Ping connection and check schema/auth
    try {
      // A simple ping: query a known table with limit 1
      const { error } = await supabase.from('products').select('id').limit(1);

      if (error) {
        // Evaluate error
        let errorType = 'Unknown Error';
        let errorMessage = error.message;

        // Check for common Auth Errors
        if (error.code === 'PGRST301' || error.message.toLowerCase().includes('jw') || error.message.toLowerCase().includes('auth')) {
          errorType = 'Auth Error';
        }
        // Check for Schema Errors
        else if (error.code === '42P01' || error.code === 'PGRST116' || error.message.toLowerCase().includes('does not exist')) {
          errorType = 'Schema Error';
        }
        
        console.error(`[DatabaseHealth] ${errorType}:`, error);

        setErrorDetails({
          type: errorType,
          message: errorMessage,
          details: `Error Code: ${error.code || 'N/A'}`
        });
        setStatus('error');
      } else {
        // Healthy!
        setStatus('healthy');
      }
    } catch (err: any) {
      // 3. Network Errors (fetch failed)
      console.error('[DatabaseHealth] Network Error:', err);
      setErrorDetails({
        type: 'Network Error',
        message: 'Failed to reach Supabase. Please check your internet connection or URL.',
        details: err.message || 'Fetch failed'
      });
      setStatus('error');
    }
  };

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="animate-spin text-slate-800" size={48} />
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Verifying Connection...</h2>
        </div>
      </div>
    );
  }

  if (status === 'error' && errorDetails) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 p-6">
        <div className="bg-white p-8 rounded-3xl max-w-lg w-full shadow-2xl border-t-4 border-red-500">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-red-100 text-red-600 flex items-center justify-center rounded-2xl shrink-0">
              <Database size={28} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest">Database Offline</h2>
              <p className="text-sm font-bold text-red-600">{errorDetails.type}</p>
            </div>
          </div>
          
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
            <p className="text-slate-700 font-medium mb-2">{errorDetails.message}</p>
            {errorDetails.details && (
              <p className="text-xs text-slate-500 font-mono bg-slate-200 p-2 rounded">{errorDetails.details}</p>
            )}
          </div>

          <button 
            onClick={checkHealth}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors uppercase tracking-widest"
          >
            <RefreshCw size={20} />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
