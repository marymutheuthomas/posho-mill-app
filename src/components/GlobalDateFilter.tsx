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
    <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 pb-4 pt-4 mb-6 shadow-sm -mt-4 -mx-4 md:-mx-8 px-4 md:px-8">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        
        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={preset.onClick}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Date Inputs */}
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm w-full xl:w-auto">
          <div className="flex items-center gap-2 px-2">
            <Calendar className="text-slate-400" size={16} />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Range</span>
          </div>
          
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={format(startDate, 'yyyy-MM-dd')}
              onChange={handleStartChange}
              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
            />
            <span className="text-slate-300 font-bold">-</span>
            <input 
              type="date" 
              value={format(endDate, 'yyyy-MM-dd')}
              onChange={handleEndChange}
              min={format(startDate, 'yyyy-MM-dd')}
              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
