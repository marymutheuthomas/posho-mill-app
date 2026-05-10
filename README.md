# Posho Mill ERP: Enterprise Blueprint 🌽⚡

A high-density, **offline-first** Enterprise Resource Planning (ERP) and Point of Sale (POS) system engineered for high-traffic milling environments. This platform provides seamless financial auditing, inventory reconciliation, and operational control even in areas with unstable internet connectivity.

---

## 🛠️ Tech Stack

- **Frontend:** React 18 + Vite (Ultra-fast HMR)
- **Styling:** Tailwind CSS (Custom "Navy, Champagne, and Warm White" palette)
- **Database & Auth:** Supabase (PostgreSQL + Real-time + Row Level Security)
- **State & Caching:** React Query v5 (Zero-latency data fetching)
- **Persistence:** PWA Service Workers + IndexedDB (Local cache)
- **Deployment:** Vercel

---

## 🧠 Core Architecture: The "Offline-First" Engine

The system is designed to never freeze or wait for a network response during critical operations.

### 1. Optimistic UI Logic
All user actions (Sales, Production Entries, Meter Readings) update the UI **instantly (0ms latency)**. The application assumes success and updates the local state immediately, while the actual Supabase mutation executes in the background.

### 2. Caching Layer & Invalidation
Using `@tanstack/react-query`, the app caches frequently accessed data (Customer Lists, Product Prices, Debt Summary). 
- **Live Pricing:** When an admin updates prices in Settings, a global cache invalidation is triggered, ensuring POS terminals receive the new rates instantly without a page refresh.

### 3. Offline Sync Queue
When `navigator.onLine` is false, failed network requests are serialized and saved to **IndexedDB/localStorage**.
- **Flushing:** Once connectivity is restored, the `SyncManager` flushes the queue, synchronizing all offline transactions to the cloud in the order they were created.

---

## 📐 Navigation & UI Rules (Split-Nav)

The application employs a context-aware navigation system that adapts to the operator's device:

| Viewport | Component Architecture | UI Behavior |
| :--- | :--- | :--- |
| **Mobile (<768px)** | **Hybrid Hamburger** | Bottom tab bar for thumbs + z-[60] Slide-out Drawer (Master Control). |
| **Tablet (768-1024px)** | **Slim Sidebar** | Persistent w-16 icon-only sidebar to maximize data density. |
| **Desktop (>1024px)** | **Expanded Sidebar** | Full w-64 sidebar with labels and Command Center Top-Bar. |

### High-Density Constraints
- **Verticality:** Uses `100dvh` for mobile viewports to prevent browser-bar cutoffs on Android/iOS.
- **Density:** Heavy use of `py-1` and `gap-2` for data-heavy tables; `grid-cols-2` layout for tablet POS.
- **Ergonomics:** Sticky footers for POS "Complete Sale" buttons to ensure the primary CTA is always reachable.

---

## 💼 Core Modules & Business Logic

### POS & Debt Ledger
- **Strict Dropdown Logic:** The POS searches exclusively against the `customer_debt_summary` view. This prevents duplicate customer profile creation and ensures live credit limits/balances are visible during checkout.
- **Double-Press Shield:** All submission buttons implement a `isSubmitting` lock to prevent accidental duplicate transactions during network lag.

### Inventory & Reconciliation
- **Stock Take Engine:** Compares `physical_count` against `theoretical_stock`. 
- **Auto-Adjustment:** Finalizing an audit automatically calculates variance and injects a 'Stock Adjustment' transaction into the ledger to reconcile the financial books with physical reality.

### Session Control & Security
- **Start-of-Day Hard Gate:** Staff are **blocked** from starting a new milling session if the previous day's inventory audit is incomplete. 
- **Power Audit:** The system calculates operational efficiency by comparing starting and ending meter readings (kWh) against total production output.

### Admin Overrides
- **Inline CRUD:** Transaction logs feature restricted Edit/Delete controls protected by confirmation modals to ensure a clear audit trail while allowing for human error correction.

---

## 🔐 Database & Security

- **Supabase Views:** The app relies heavily on complex Postgres Views (e.g., `customer_debt_summary`) to aggregate debt, repayments, and sales in a single high-performance query.
- **RLS (Row Level Security):** Access is strictly governed by RLS policies. Admins have full schema access, while Employees are restricted to operational tables (Sales, Sessions, Production).

---

## 🚀 Setup & Deployment

### Local Setup
1. **Clone & Install:**
   ```bash
   npm install
   ```
2. **Environment Variables:**
   Create a `.env` file in the root:
   ```env
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
3. **Run Dev Server:**
   ```bash
   npm run dev
   ```

### Vercel Deployment Checklist
- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Project Settings.
- [ ] Ensure "PWA" configuration in `vite.config.ts` is pointing to the correct service worker.
- [ ] Verify that `dist` directory is generated successfully via `npm run build`.

---

**Built for Resilience. Engineered for Growth.**
