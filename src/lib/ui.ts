// Shared class names for every screen. Change a look here and every screen follows;
// do not re-type these strings per screen.
// Text size/weight of fields comes from the base field rule in index.css.

/** Any typed field or select: 48px touch target, slate-300 border, emerald focus ring. */
export const FIELD = 'mill-input w-full h-12 px-4 rounded-xl border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

/** Weights, meter readings, amounts: same box, monospace digits, 24px text centred in 48px. */
export const FIELD_NUM = `${FIELD} !py-0 font-mono text-2xl font-semibold`;

/** Label above a field. */
export const FIELD_LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5';

/** Card headers and section titles (add text-white on dark headers). */
export const SECTION_TITLE = 'text-lg font-bold tracking-tight';

// ——— Buttons ———
// Colour rules: navy = the main action, emerald = completing a sale/payment/money move,
// red = destructive (delete, void, stop mill). Nothing else gets those colours.

const BASE = 'inline-flex items-center justify-center gap-2 text-center select-none transition-colors active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed';
const BLOCK = `${BASE} h-12 rounded-lg text-sm`;

export const btn = {
  /** The one main action on a screen or modal. */
  primary: `${BLOCK} px-5 font-medium bg-brand hover:bg-brand-hover text-white`,
  /** Completes a sale, payment or other money move. */
  confirm: `${BLOCK} px-5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white`,
  /** Cancel, Back, filters, anything secondary. */
  secondary: `${BLOCK} px-4 font-medium bg-slate-100 hover:bg-slate-200 text-slate-700`,
  /** Delete, Void, Stop Mill. */
  danger: `${BLOCK} px-5 font-semibold bg-red-600 hover:bg-red-700 text-white`,
  /** Icon-only control: 44x44 tap area whatever the icon size (use 16-18px icons). */
  icon: `${BASE} min-w-11 min-h-11 p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900`,
  /** Icon-only control on a dark header (modal close). */
  iconOnDark: `${BASE} min-w-11 min-h-11 p-2 rounded-md text-white/70 hover:bg-white/10 hover:text-white`,
  /** Icon-only destructive control (table delete). */
  iconDanger: `${BASE} min-w-11 min-h-11 p-2 rounded-md text-red-500 hover:bg-red-50 hover:text-red-700`,
} as const;

/** Side-menu / drawer item: 44px, navy when it is the open screen. */
export const navItem = (active: boolean) =>
  `w-full flex items-center gap-3 min-h-11 px-3 rounded-lg text-sm font-medium transition-colors ${active
    ? 'bg-brand text-white shadow-sm'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;

/** The one horizontal padding for the app shell: header, banners and page area line up. */
export const SHELL_X = 'px-4 md:px-6';

/** Segmented choices and tabs (Milling/Retail, Cash/M-Pesa...): 48px, navy when selected. */
export const chip = (active: boolean) =>
  `${BASE} h-12 px-4 rounded-md text-sm font-medium border ${active
    ? 'bg-brand border-brand text-white'
    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`;
