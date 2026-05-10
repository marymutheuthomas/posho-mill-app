import { useState, useEffect } from 'react';
import { networkState } from '../lib/network';

export default function SyncStatusBar() {
  const [status, setStatus] = useState(networkState);

  useEffect(() => {
    const handler = () => setStatus({ ...networkState });
    window.addEventListener('network_status_change', handler);
    return () => window.removeEventListener('network_status_change', handler);
  }, []);

  if (!status.isOnline) {
    return (
      <div className="flex items-center gap-1.5 text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        <span className="text-[9px] font-black uppercase tracking-widest">Offline</span>
      </div>
    );
  }

  if (status.isReconnecting) {
    return (
      <div className="flex items-center gap-1.5 text-amber-500">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-[9px] font-black uppercase tracking-widest">Reconnecting…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-emerald-500">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span className="text-[9px] font-black uppercase tracking-widest">Synced</span>
    </div>
  );
}
