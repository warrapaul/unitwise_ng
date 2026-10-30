# Work plan — tt.txt (dashboard, navigation and rent workflow redesign)

Status key: ✅ done · ⏭ later / TODOLATER

## What to borrow from the sample screenshots
| Sample | Borrow | Leave |
|---|---|---|
| PropManage | Compact header: title and scope on the left, actions on the right. KPI tiles with the change against last month. A trend chart. An "Upcoming lease renewals" list with an action per row. | The recent-activity feed (later), and the donut for maintenance (a three-part status reads better as counts) |
| Kayapro360 | Credit held for tenants ("amount in wallets"), because overpayment now carries forward. Count badges on nav items that need work. | The gradient glass cards and the icon in every tile |
| PropMate | One card per domain with two or three facts and one "View all" link: the layout for the Tenants & leases and Rent sub-dashboards. | Pill buttons as wide as the card |
| LOFTx | The per-property vacancy table, and lease expiries grouped by when they end. | Dual-axis charts, and nine KPI tiles at once |
| Your mock-ups (5, 6) | The whole hierarchy: KPIs → collection progress → needs attention → building performance, and the grouped sidebar with a one-line description per item. | — |

A chart with no data yet shows sample figures, and the chart says so in a "Sample data" badge.

## Stage 1 — Dashboard redesign
1. ✅ **Compact title bar** replaces the "Default · Agency overview" card. It shows the title, "October 2026 · All buildings" (or the active building), a month filter and the primary actions. Shortcut chips are gone; the grouped sidebar covers them.
2. ✅ **KPI row:**
   - Expected
   - Collected, as % of expected
   - Outstanding, with the number of rooms that have a balance
   - Occupancy, as one decimal ("16.7% · 2 of 12 rooms")

   Credit held for tenants is left out: the system records credit *applied* per month, not a running balance per tenant.
3. ✅ **Collection progress bar:** received and remaining, plus reported payments waiting to be confirmed (kept apart from collected money).
4. ✅ **Action centre** (open, not folded behind a count). Each item links straight to its task:
   - overdue rent, naming the top rooms and amounts
   - payments to confirm
   - meter readings
   - leases awaiting signature
   - leases ending in 30 days
   - tenants awaiting review
   - room applications
   - open repairs
5. ✅ **Building performance:** one row per building with rooms, occupied and collected / expected, plus a progress bar and the billing step. With a building active, a "Rent per room" preview shows that building's rooms with a balance.
6. ✅ **Rent trend chart** (expected and collected, 6 months), drawn in SVG with tooltips and a legend. Sample data is labelled as such.
7. ✅ **Tenants & leases card and upcoming lease endings:** leases ending in the next 90 days, each linked to its lease.
8. ✅ The month filter drives every figure: the stats endpoints take `from`/`to`, and the building breakdown now honours both the month and the building.

## Consistency fixes
9. ✅ **Skipped meter readings:**
   - Readings deferred at confirmation are counted per building and shown as "1 reading carried to November" instead of "Meter readings to enter".
   - A confirmed month never counts as waiting for readings.
   - The billing step for a confirmed month says what was carried forward.
10. ✅ **Leases:** a lease awaiting signature is counted. The headline is "current leases" (active + awaiting signature), with the split underneath, so it can no longer read "0 active" beside "2 awaiting signature".
11. ✅ **One percentage format:** `formatPercent` (one decimal) in `shared/utils/format.util.ts`, used by every dashboard and tile. 16.7% everywhere, never 17% in one place and 16.7% in another.
12. ✅ **One source of truth:** every rent figure on the dashboard, the rent sub-dashboard and the building rows comes from `RentBalanceCalculator`, the same path the room's month record, the arrears pages and reminders use. The one exception was the M-Pesa STK prompt amount, which had its own sum (it subtracted charge payments separately); it now uses the calculator too. Rates are the server's and are only formatted in the browser.
13. ✅ Payments list mixing October and November: this is correct when no filter is set (your note). No change.

## Navigation
14. ✅ **Sidebar regrouped**, with a short description under each item:
    - **Property:** Properties (agencies, buildings), Tenants & leases (overview, tenants, leases, amendments, applications)
    - **Financial management:** Rent & billing (overview, rent per room, adjustments), Payments (all payments, to confirm), Arrears & reports, Deposits
    - **Operations:** Utilities & meter readings, Maintenance, Communication

    Settings stays with General. All three agency sections sit directly under the dashboard. The charge catalog stays super-admin only, under Rent & billing.

## Stage 2 — Rent & billing consolidation
15. ✅ **Rent & billing sub-dashboard** (`/admin/rent`, which now opens here instead of "Overdue portfolio"):
    - month KPIs
    - the monthly cycle for each building, as five steps (Generate → Readings & adjustments → Review & confirm → Payments → Balances), with counts and the next action
    - arrears ageing
    - top debtors
16. ✅ **Building detail** shows the same five-step billing cycle (shared `app-billing-cycle`).
17. ⏭ **Rent per room:** each room opens a panel with billed amounts, payment history, adjustments, utility charges and balance. The room-month dialog covers most of this today; a full room history panel is next.
18. ⏭ **Rent adjustments:** a live preview of the bill before applying.

## Stage 3 — Payment reconciliation
19. ⏭ **Payments to confirm:** tabs for awaiting review / matched / unmatched / confirmed, and an audit trail per report. Matching and confirmation exist (prompt4); this pass covers the layout.
20. ⏭ **Rent payments:** one interface for recording, receipt search and tenant/month filters.

## Stage 4 — Portfolio and tenant management
21. ✅ **Tenancy summary on the Tenants page** (replaced the separate `/admin/tenants/overview` page, which was four sparse cards that each led elsewhere; old links redirect). One compact row above the table:
    - Tenant counts (active, pending my review, verified not moved in, notice given) filter the table to that status.
    - Lease counts (to sign, ending in 30 days) and applications open their own lists.
22. ⏭ **Tenant detail:** one page with contact, lease, room, payments, arrears, deposit, documents and maintenance. Most panels exist; the missing pieces are the arrears summary and maintenance requests.
23. ⏭ **Building management:** room-level occupancy, vacancy age, lease status, maintenance cost and income. Vacancy age needs a "vacant since" date that the system does not record yet.

## Design system
24. ✅ **Global tokens and styles** in `styles.scss`:
    - spacing scale (`--space-1…8`)
    - type scale
    - `.page-head` (title, context, filters, action)
    - `.kpi-grid` / `.kpi`
    - `.progress`
    - `.attention-list`
25. ✅ **Status badges:** `shared/constants/status-badges.ts` maps each status (pending, confirmed, paid, partially paid, overdue, cancelled, …) to one tone and, where the enum reads badly, one label. The existing `app-status-chip` reads from it, so every page shows the same words and colours.
26. ⏭ **Table standard** (alignment, row height, sorting, empty states, pagination) is partly global already. Moving every page onto it is a later sweep.

## Later
- ⏭ Recent activity feed (payments received, tenants onboarded).
- ⏭ Count badges on Financial nav items (payments to confirm).
- ⏭ Vacancy alerts ("Room 302 vacant for 172 days"), which need a vacant-since date.
- ⏭ **TODOLATER: other confirmation messages.** Pasted messages are read in full for M-Pesa (code, amount, date, payer, phone, account number → tenant). Bank SMS and other wallets (Airtel Money, Equity, KCB, …) word their confirmations differently and need their own patterns in `PaymentMessageParser`. Until then they yield only what the generic reference and amount patterns catch.
