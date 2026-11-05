import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { SECTION_TITLE, chip } from '../lib/ui';

// The in-app copy of the user guide. Kept in the app (not a link) so it opens offline and
// needs no account. Keep it in step with the shared "Sakhai Posho Mill – User Guide" doc.

interface Section { id: string; title: string; adminOnly?: boolean; body: ReactNode }

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-slate-900">{children}</strong>;
const P = ({ children }: { children: ReactNode }) => <p className="text-sm leading-relaxed text-slate-700">{children}</p>;
const Steps = ({ items }: { items: ReactNode[] }) => (
  <ol className="list-decimal pl-5 space-y-1.5 text-sm leading-relaxed text-slate-700 marker:font-mono marker:text-slate-500">
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ol>
);
const Bullets = ({ items }: { items: ReactNode[] }) => (
  <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-slate-700">
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);
const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200">
    <table className="w-full min-w-[480px] text-left text-sm">
      <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <tr>{head.map(h => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-3 py-2 align-top ${j === 0 ? 'font-medium text-slate-900' : ''}`}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

const SECTIONS: Section[] = [
  {
    id: 'screens', title: 'Screens and who uses them',
    body: <>
      <P>Staff see eight screens; admins see two more. Staff are cashiers and millers; admins are the owner and managers.</P>
      <Table head={['Screen', 'Who sees it', 'What it is for']} rows={[
        ['Point of Sale', 'Everyone', 'Selling flour and charging for milling. Opens first after you sign in.'],
        ['Session Control', 'Everyone', 'Opening and closing a shift and recording the power meter.'],
        ['Production Hub', 'Everyone', "Recording maize milled into flour for the shop's own stock."],
        ['Stock Take', 'Everyone', 'Counting what is physically in the store.'],
        ['Customers', 'Everyone', 'Customer details, money owed, payments, statements.'],
        ['Purchases', 'Everyone', 'Stock bought and money spent on expenses.'],
        ['Dashboard', 'Everyone', "Today's sales, milling and production figures."],
        ['Settings', 'Everyone', 'Product prices and milling fees. Everyone can see them; only admins can change them.'],
        ['Insights & Audit', 'Admins', 'Flagged problems, stock counts, the stock ledger, financial reports.'],
        ['User Management', 'Admins', 'Adding staff accounts and setting their role.'],
      ]} />
    </>,
  },
  {
    id: 'sign-in', title: 'Signing in',
    body: <>
      <P>Sign in with your email and password; the system opens on the Point of Sale.</P>
      <Steps items={[
        'Open the app on the tablet or phone.',
        'Enter the email and password your admin gave you, then sign in.',
        <>The Point of Sale opens. Tap <B>Log out</B> in the menu when you finish your shift.</>,
      ]} />
      <P><B>No internet?</B> If you have signed in on this device before while online, you can still sign in. Your work is saved on the device and sent later (see <em>Working without internet</em>).</P>
      <P>Admins create accounts in <B>User Management</B>. Ask an admin if you forget your password.</P>
    </>,
  },
  {
    id: 'screen', title: 'Reading the screen',
    body: <>
      <P>The menu takes you between screens; the top bar tells you whether your work has reached the system.</P>
      <Bullets items={[
        <><B>Menu.</B> On a tablet or computer it runs down the left side. On a phone it runs along the bottom; swipe it sideways to see every screen. The screen you are on is dark blue.</>,
        <><B>Point of Sale.</B> The menu hides to give the till more room. Tap the blue menu button at the top left to open it.</>,
        <><B>Top bar.</B> It shows the screen name, the open shift (for example <em>External shift</em>, with a green dot) and the sync status: <B>Synced</B> (green) = everything is saved; <B>3 pending</B> (amber) = waiting to send; <B>Offline</B> (red) = no internet, keep working; <B>2 failed</B> (red, admins only) = records the system refused.</>,
        <><B>Amber messages</B> under the top bar are reminders. They never stop you working. Tap the X to hide one.</>,
      ]} />
    </>,
  },
  {
    id: 'day', title: 'The working day',
    body: <>
      <P>A normal day has five steps; each has its own section below.</P>
      <Steps items={[
        <><B>Open a shift</B> before the mill starts, so the power meter is recorded (Session Control).</>,
        <><B>Sell and mill for customers</B> at the Point of Sale all day.</>,
        <><B>Record production</B> whenever you mill the shop's own maize (Production Hub).</>,
        <><B>Count the stock</B> when asked, and always after a late close (Stock Take).</>,
        <><B>Close the shift</B> with the final meter reading when the mill stops (Session Control).</>,
      ]} />
      <P>Record purchases and customer payments whenever they happen.</P>
      <P><B>Counting the till.</B> At the end of the day, count the cash and check the M-Pesa total, then on the <B>Dashboard</B> tap <B>Log cash drop</B>, enter both and tap <B>Submit cash drop</B>. It saves offline too. Admins compare it with expected takings under Insights &amp; Audit → Financials.</P>
    </>,
  },
  {
    id: 'shift', title: 'Opening and closing a shift',
    body: <>
      <P>A shift records the power meter at the start and end, so the owner can see how much electricity each kilogram of grain used.</P>
      <Bullets items={[
        <><B>External</B>: milling customers' own grain for a fee. This is most counter work.</>,
        <><B>Internal</B>: milling the shop's own maize into flour for sale.</>,
      ]} />
      <P><B>To open a shift:</B></P>
      <Steps items={[
        <>Go to <B>Session Control</B>.</>,
        <>Tap <B>Internal</B> or <B>External</B>.</>,
        "Check the opening meter reading. It is taken from the last shift's closing reading.",
        <>Tap <B>Authorize Start</B>.</>,
      ]} />
      <P>Shortcut: when no shift is open, the Point of Sale and Production Hub show an amber message with a <B>Start Default Shift</B> button (External on the Point of Sale, Internal in the Production Hub).</P>
      <P><B>To close a shift:</B></P>
      <Steps items={[
        'Read the meter on the wall.',
        <>Go to <B>Session Control</B> and tap <B>Stop Session</B>, or type the reading into the dark bar at the top of the Point of Sale or Production Hub and tap <B>Shutdown</B>.</>,
        'Enter the final reading in kWh. It cannot be lower than the opening reading.',
        <>Confirm with <B>Stop Mill</B>. Closing cannot be undone; an admin can correct readings later.</>,
      ]} />
      <P>Forgot to open a shift? Sales and production still save. They are not linked to a shift, and the power for that time is not counted.</P>
    </>,
  },
  {
    id: 'sale', title: 'Making a sale',
    body: <>
      <P>Every sale is entered, checked on a review screen, then confirmed. The price fills in by itself from the weight.</P>
      <Steps items={[
        <>Choose <B>Milling</B> (customer's own grain, charged a fee) or <B>Retail</B> (selling the shop's flour).</>,
        <>Pick the <B>Product</B>. The list shows stock left and the price per kg.</>,
        <>Enter the <B>Weight (KG)</B>. Milling fees round up to the nearest KSh 5.</>,
        <>Leave <B>Transaction Date</B> as today, unless entering a sale from an earlier day.</>,
        <><B>Customer</B> is optional for cash sales. Search by name; balances owed show in red.</>,
        <>Choose how they pay: <B>Cash</B>, <B>M-Pesa</B>, <B>Debt</B> or <B>Split</B>.</>,
        <>Tap <B>Checkout &amp; Sync</B>, check the review, then tap <B>Confirm</B>.</>,
      ]} />
      <P>A green message confirms the sale. <em>Saved locally</em> means you are offline and it will send later.</P>
      <P><B>Split payments.</B> Enter the cash, M-Pesa and debt parts. They must add up exactly to the total charge.</P>
      <P><B>Selling on credit.</B> A sale with debt needs a customer selected. If it takes the customer near or over their credit limit, an amber or red warning appears. You can still complete the sale: the warning is there so you can decide.</P>
      <P><B>Mistakes.</B> Recent sales are listed under <em>Sales History Log</em>. Anyone can view a sale; only an admin can edit or void it. Tell an admin straight away.</P>
    </>,
  },
  {
    id: 'customers', title: 'Customers and debt',
    body: <>
      <P>A customer's balance is worked out from their history (credit sales minus payments), so it is always up to date; nobody types it in.</P>
      <P><B>Add a customer:</B> go to <B>Customers</B>, tap <B>Add customer</B>, fill in name and phone (location, KRA PIN and notes are optional) and tap <B>Save customer</B>. Only admins can set a credit limit.</P>
      <P><B>Take a payment:</B></P>
      <Steps items={[
        'Open the customer from the list (search by name, phone or location).',
        <>Enter the amount, choose <B>Cash</B>, <B>M-Pesa</B> or <B>Bank</B>, and add the M-Pesa code in the note.</>,
        <>Tap <B>Record</B>. The balance drops straight away.</>,
      ]} />
      <P><B>Statement:</B> open the customer, choose the dates and tap <B>PDF</B> to download a statement to share or print.</P>
    </>,
  },
  {
    id: 'production', title: 'Recording production',
    body: <>
      <P>Record each batch of the shop's own maize you mill, so stock moves from maize to flour.</P>
      <Steps items={[
        <>Go to <B>Production Hub</B>. Check the <B>Production Date</B>.</>,
        <><B>Raw Input (Bulk):</B> the kg of bulk maize put in. It cannot be more than the bulk maize in stock, shown under the box.</>,
        <><B>Main Flour Output:</B> choose the grade and enter the kg of flour.</>,
        <><B>By-Products:</B> optional; choose one and enter its kg.</>,
        <><B>Processing Loss:</B> kg lost in milling.</>,
        <>Check <B>Kuku Feed</B>: it fills in by itself as whatever is left over.</>,
        <>Tap <B>Record Daily Yield</B>.</>,
      ]} />
      <P>The button stays grey until the weights add up: flour + by-product + loss cannot be more than the maize put in. To sell raw, unmilled maize, use the Point of Sale.</P>
    </>,
  },
  {
    id: 'purchases', title: 'Purchases and expenses',
    body: <>
      <P>Record everything the mill buys or pays for, so stock and profit stay correct.</P>
      <Bullets items={[
        <><B>Inventory Restock</B> (stock bought, such as bulk maize): choose the product, quantity in kg, unit price and supplier. Stock goes up when you save.</>,
        <><B>General Expense</B> (money spent, such as salaries or repairs): enter a description, choose a category, the quantity and unit price.</>,
      ]} />
      <P>The total is quantity × unit price. Purchases need an internet connection.</P>
    </>,
  },
  {
    id: 'stock-take', title: 'Stock take',
    body: <>
      <P>A stock take compares what is really in the store with what the system expects, and records who counted.</P>
      <Steps items={[
        <>Go to <B>Stock Take</B> (the <B>Record</B> tab).</>,
        <>Weigh each product and type the kg into <B>Measured Physical Count (KG)</B>. The system's figure shows beside it.</>,
        <>Check the date and time, then tap <B>Finalize Reconciliation</B>.</>,
      ]} />
      <P>The system's stock is corrected to your count, and any difference is kept on record. Count carefully: a wrong count changes the stock figures. The <B>Log</B> tab lists past counts; only admins can edit or delete them.</P>
    </>,
  },
  {
    id: 'offline', title: 'Working without internet',
    body: <>
      <P>Keep working when the internet drops: sales, production, stock takes, shifts and customer payments are saved on the device and sent automatically when the connection returns.</P>
      <Bullets items={[
        <>The top bar shows <B>Offline</B>, then <B>N pending</B> until everything has sent, then <B>Synced</B>.</>,
        'Do not clear the browser data or uninstall the app while records are pending; they would be lost.',
        <>If you signed in while offline, an amber message asks you to <B>Sign in</B> again once the internet is back. Do it so your records can send.</>,
        'Purchases, user management and approving audit items need the internet.',
      ]} />
    </>,
  },
  {
    id: 'admins', title: 'For admins', adminOnly: true,
    body: <>
      <P><B>Dashboard.</B> Choose Today, Yesterday, This Week or Custom dates. Retail Sales shows cash and M-Pesa received and sales by product; External Milling shows fees and kg milled; Internal Production shows flour made, yield and <B>power efficiency</B> in kWh per kg (on target at 0.25 or less). Failed sync records appear at the top: fix and <B>Retry</B>, or <B>Discard</B>.</P>
      <P><B>Insights &amp; Audit → Audit desk.</B></P>
      <Bullets items={[
        <><B>Anomaly review queue:</B> flagged problems; amber = warning, red = critical. Check each, then tap <B>Approve &amp; Lock</B>. Approved items cannot be edited afterwards.</>,
        <><B>Physical count discrepancies:</B> every stock take, with missing stock in red. Use <B>Missing only</B> to see shortfalls.</>,
        <><B>Inventory ledger:</B> every stock movement, newest first. Filter by product or source; it cannot be edited.</>,
      ]} />
      <P>Staff never see this page. When one of their own entries is flagged, they get a short amber message instead.</P>
      <P><B>Insights &amp; Audit → Financials.</B> Profit and loss by month, daily cash flow, power use per shift, production yield, debt aging and stock reconciliation. <em>Net position</em> is net cash generated + stock value + money owed by customers; opening capital and owner withdrawals are not recorded, so it is not a full balance sheet.</P>
      <P><B>User Management.</B> Add staff with name, email, a temporary password and a role: Mill Employee or System Administrator. Give admin rights only to people who need them.</P>
      <P><B>Settings.</B> Set each product's Milling Fee and Retail Price per kg, then save. New prices apply to new sales only.</P>
    </>,
  },
  {
    id: 'problems', title: 'Problems and fixes',
    body: <>
      <Table head={['Problem', 'What to do']} rows={[
        ['Top bar says Offline', 'Keep working. Records send when the internet returns.'],
        ['Pending number does not go down when online', 'Sign in again if the amber message asks; otherwise tell an admin.'],
        ['Failed badge in the top bar (admins)', 'Open the Dashboard, check each failed record, fix and Retry, or Discard.'],
        ['Amber "No active shift" message', 'Tap Start Default Shift, or open one in Session Control. Sales still save meanwhile.'],
        ['Checkout & Sync is grey', 'A Debt sale needs a customer. Select one, or change the payment type.'],
        ['"Split error" on a sale', 'The cash, M-Pesa and debt parts must add up exactly to the total.'],
        ['Credit-limit warning', 'Decide with the customer; the sale can still go through.'],
        ['"Insufficient stock" in the Production Hub', 'Record the maize purchase in Purchases first.'],
        ['Wrong sale entered', 'Tell an admin; only admins can edit or void sales.'],
        ['Log cash drop says it is not set up', 'An admin needs to run database migration 20261109 once. Count the till on paper until then.'],
        ['Cannot change prices in Settings', 'Prices and milling fees can only be changed by an admin.'],
        ['Insights & Audit is missing from the menu', 'It is for admins only.'],
      ]} />
      <P>For anything else, note the screen, the time and the exact message, and tell an admin.</P>
    </>,
  },
];

export default function UserGuide({ role }: { role?: string | null }) {
  const sections = SECTIONS.filter(s => !s.adminOnly || role === 'ADMIN');
  const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <CircleHelp size={24} className="text-brand" /> User Guide
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          How to use the mill system, from opening a shift to closing it. Nothing stops you working during busy hours:
          when something needs attention it shows an amber message, and you can carry on.
        </p>
      </div>

      <nav aria-label="Guide contents" className="bg-white rounded-2xl border border-slate-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Contents</p>
        <div className="flex flex-wrap gap-2">
          {sections.map(s => (
            <button key={s.id} type="button" onClick={() => jump(s.id)} className={`${chip(false)} !h-11`}>{s.title}</button>
          ))}
        </div>
      </nav>

      {sections.map(s => (
        <section key={s.id} id={`guide-${s.id}`} aria-labelledby={`guide-${s.id}-title`}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-3 scroll-mt-4">
          <h2 id={`guide-${s.id}-title`} className={`${SECTION_TITLE} text-slate-900`}>{s.title}</h2>
          {s.body}
        </section>
      ))}
    </div>
  );
}
