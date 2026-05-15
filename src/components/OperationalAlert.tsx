import { AlertTriangle, Info, X } from 'lucide-react';

interface OperationalAlertProps {
  message: string;
  type?: 'warning' | 'error' | 'info';
  onClose?: () => void;
  persistent?: boolean;
}

export default function OperationalAlert({ message, type = 'warning', onClose, persistent = false }: OperationalAlertProps) {
  const isError = type === 'error';
  const isInfo = type === 'info';

  return (
    <div className={`w-full max-w-2xl mx-auto mb-6 rounded-2xl border-2 overflow-hidden shadow-2xl animate-in slide-in-from-top-4 duration-500 bg-[#0F172A] ${isError ? 'border-red-500' : isInfo ? 'border-blue-500' : 'border-[#F59E0B]'}`}>
      <div className="flex items-stretch h-14 md:h-16">
        <div className={`flex items-center justify-center px-6 ${isError ? 'bg-red-500' : isInfo ? 'bg-blue-500' : 'bg-[#F59E0B]'}`}>
          {isError ? <AlertTriangle className="text-white" size={24} /> : isInfo ? <Info className="text-white" size={24} /> : <AlertTriangle className="text-[#0F172A]" size={24} />}
        </div>
        <div className="flex-1 flex items-center px-6 py-2">
          <p className="text-[11px] md:text-xs font-black text-white uppercase tracking-tight leading-tight">
            {message}
          </p>
        </div>
        {!persistent && onClose && (
          <button onClick={onClose} className="px-4 flex items-center justify-center text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
