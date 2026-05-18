import React from 'react';
import { format, subDays, startOfMonth, startOfYear } from 'date-fns';
import { Calendar } from 'lucide-react';

interface GlobalDateFilterProps {
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
}

export default function GlobalDateFilter({ startDate, endDate, onChange }: GlobalDateFilterProps) {
  const today = new Date();

  const presets = [
    { label: 'Today', onClick: () => onChange(today, today) },
    { label: 'Last 7 Days', onClick: () => onChange(subDays(today, 6), today) },
    { label: 'Last 30 Days', onClick: () => onChange(subDays(today, 29), today) },
    { label: 'This Month', onClick: () => onChange(startOfMonth(today), today) },
    { label: 'Year to Date', onClick: () => onChange(startOfYear(today), today) },
  ];

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = new Date(e.target.value);
    if (!isNaN(newStart.getTime())) {
      onChange(newStart, endDate);
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = new Date(e.target.value);
    if (!isNaN(newEnd.getTime())) {
      onChange(startDate, newEnd);
    }
  };

  return (
    <div className="static md:sticky md:top-0 z-30 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 py-3 mb-4 shadow-sm -mt-4 -mx-4 px-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
        
        {/* Presets - persistent, wrap gracefully */}
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={preset.onClick}
              className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Date Inputs - balanced layout with overflow safety */}
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1.5 px-1 text-slate-400">
            <Calendar size={14} className="shrink-0" />
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest hidden xs:block">Range</span>
          </div>
          
          <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-initial">
            <input 
              type="date" 
              value={format(startDate, 'yyyy-MM-dd')}
              onChange={handleStartChange}
              className="text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer min-w-0 flex-1 sm:flex-initial"
            />
            <span className="text-slate-300 font-bold text-xs">-</span>
            <input 
              type="date" 
              value={format(endDate, 'yyyy-MM-dd')}
              onChange={handleEndChange}
              min={format(startDate, 'yyyy-MM-dd')}
              className="text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer min-w-0 flex-1 sm:flex-initial"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
