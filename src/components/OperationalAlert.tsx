import { AlertTriangle, Info, X } from 'lucide-react';
import { btn } from '../lib/ui';

interface OperationalAlertProps {
  message: string;
  type?: 'warning' | 'error' | 'info';
  onClose?: () => void;
  persistent?: boolean;
}

// Slim single-row alert so notices never push the working screen far down.
export default function OperationalAlert({ message, type = 'warning', onClose, persistent = false }: OperationalAlertProps) {
  const isError = type === 'error';
  const isInfo = type === 'info';
  const tone = isError
    ? 'border-red-200 bg-red-50 text-red-800'
    : isInfo ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${tone}`}>
      {isInfo ? <Info size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
      <p className="text-[11px] font-semibold flex-1 min-w-0">{message}</p>
      {!persistent && onClose && (
        <button onClick={onClose} aria-label="Dismiss" className={`${btn.icon} shrink-0`}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
