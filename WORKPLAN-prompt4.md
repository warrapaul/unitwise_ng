# Work plan — prompt4.txt review

Status key: ✅ done in this pass · 🟡 frontend only, not started · 🔴 needs backend (unitwise_sb) · ❓ your decision

Data-only issues (bld1, "mtttty", caretaker name, availability text, the
September water/garbage on an October move-in) are skipped, as you asked.

---

## Done in this pass (frontend)

### Tenant dashboard
- ✅ Due-date "conflict": the backend sets a first month's due date to the move-in day
  when that falls after the usual due day (`TenancyRentResolver.dueDate`). The bill
  now says "Due 9 Oct 2026 (your move-in day)", so it no longer looks like it
  contradicts "the 5th of each month".
- ✅ Bill title is just the month; "This month · Due …" moved into the subtitle (it
  used to wrap onto two lines next to the month picker).
- ✅ Overdue chip shows how many days overdue. Paid state reads "You're all paid up".
- ✅ "KES X billed · KES Y confirmed" (was "paid") — makes clear the figure counts confirmed payments only.
- ✅ "Changes to your bill" written in plain words ("Added KES 201", "KES 200 changed to KES 0")
  instead of `0 → 201`. Shows the 3 latest, plus "View all N changes" → Balance & statements.
- ✅ Claim statuses: Awaiting confirmation / Confirmed / **Needs attention** (was "Not accepted").
- ✅ Quick actions are now things to do: Balance & statements, Payment history, Documents,
  Message the landlord. Removed Renter profile and My account, which the sidebar already has.
- ✅ A one-line tenancy summary (Room · Building · status chip) above the dashboard.
- ✅ "Rent and how to pay": numbered M-Pesa steps, "Paybill account no." label, the bank
  in its own "Or pay by bank" block, and labelled copy buttons ("Copy paybill number").
- ✅ Monthly charges: "Included in rent" is a badge. "For the month before" now says which month,
  e.g. "This month's bill: September 2026 usage".
- ✅ Room history only shows once the tenant has had more than one room.

### Shell / header
- ✅ Sign out has its own log-out icon (it used the "My orders" paper plane).
- ✅ "Find a room" is commented out in the Tenancy nav, with a TODO.
- ✅ "My arrears" is renamed "Balance & statements" (route title and quick action).
- ✅ The role badge is gone from every dashboard header. It now shows on the profile page as
  "Working as: Agency admin · <agency>", humanised, for all roles.
- ✅ The tenant header now reads "Welcome back, <name>"; the agency header reads "<Agency> · Agency overview".

### Agency dashboard
- ✅ Merged values ("1 8%", "6,00077%"): Occupancy % and Collection % now have their own columns.
- ✅ Columns renamed: Active tenants, Leases ending soon, Open repairs.
- ✅ "Moves in and out" section removed.
- ✅ Leases group leads with Pending signature, then Ending soon, then Active. Occupancy leads with the rate.
- ✅ Collapsed attention bar names the most urgent item ("1 lease awaiting signature and 2 more")
  instead of only "3 things need attention".
- ✅ Quick links lead with rent work: Payments to confirm, Rent per room, Meter readings, Overdue,
  then Tenants and Buildings.

---

## Done in pass 2

### Frontend (items 1–8)
- ✅ **Maintenance.** New `features/maintenance`. Tenants get /me/maintenance: report an issue
  (category, urgency, details) and see their requests with status, caretaker notes and Cancel.
  Staff get /admin/tenants/maintenance: agency- or building-wide list, open-only filter, and
  status buttons limited to what the server allows. The tenant dashboard now has a
  "Report an issue" quick action, the agency dashboard an "N open repair requests" link, plus
  nav entries and notification links. *Photos are not supported yet — the backend has no
  attachment on maintenance requests.*
- ✅ **Report-payment form, paste first.** Pasting the SMS fills in the amount, code and date
  (`payment-message.ts`), and the tenant can correct them. The proof upload is folded away and now
  uses the shared `app-file-upload` (§13). It shows the month's balance and that the balance only
  drops once the payment is confirmed. The button reads "Submit for confirmation".
- ✅ **Meter readings.** An empty state that names the month, and a Used / Rate / Charge
  breakdown. A reading below the previous one is blocked, with an explanation.
- ✅ **Rent per room.** KES formatting everywhere, right-aligned. "Collection rate" label.
  The room count follows the "Occupied only" filter. The room dialog shows the building name and
  links to the tenant, with columns renamed to "Billed / Still owed".
- ✅ **Record payment.** A read-back before saving: tenant · room · building · month ·
  date written out · method. It shows the balance and says whether this is a part payment or an
  overpayment carried forward as credit.
- ✅ **Reason dropdowns with "Other (specify)"** (`reason-field.component.ts`) for adjust, waive,
  reinstate and add charge, in both the room dialog and the adjustments page.
- ✅ **Billing workflow.** The same three steps in every state: Generate bills → Readings &
  adjustments → Review & confirm. It explains that bills are created automatically on the
  billing day. "Readings missing" links to the readings. The confirm dialog gives the bill count,
  the total and what happens to missing readings, and says tenants will be notified. After
  "Create bills" the page polls the job and reports success or failure.
- ✅ **Notifications.** Category filter (Payments / Tenancy / Maintenance / Orders / Messages &
  system), backed by a new `category` parameter on GET /v1/notifications and /unread.
  "Payment to confirm" opens Payments to confirm with that report highlighted and scrolled into view.

### Backend Stage 1
- ✅ **Receipt KES 7,801 vs 7,600 — not a code bug.** The tenant view, the PDF and the landlord's
  room breakdown all build from the same `RentUtilityMonthlyCharge` rows (billedMonth) and the same
  `RentBalanceCalculator`. The two figures are October (7,801) and November (7,600), as the
  review itself suspected.
- ✅ **A receipt per confirmed payment.** `GET /v1/my-arrears/{tenantId}/payments/{transactionId}/receipt`.
  It covers COMPLETED transactions only; anything else gets a 400. The receipt number is
  `RCP-<year>-<transaction id>`, so it is the same on every download. It names the agency,
  building and address, tenant, room and tenancy ref., then amount, method, reference, date and
  allocation. Totals: received, billed, received to date, and **"Balance after this payment" on
  its own line** (or credit carried forward). Each row in the tenant's payment list now has a
  status chip and a receipt download.
- ✅ **Bills final → tenants notified.** Confirming a month raises `RentMonthConfirmedEvent`.
  After commit, each tenant gets `RENT_BILL_READY` ("Your October 2026 bill is final: KES X to
  pay. Due …"). The "not final yet" note already disappears once the cycle is confirmed.
- ✅ **Auto-confirm, opt-in per building.** Adds `buildings.bills_auto_confirm_day` (migration
  V17; null = by hand, the default). `BillsAutoConfirmCron` runs daily at 03:00 and confirms due
  months, carrying missing readings forward. It is set on the building form, where empty means
  off, and shown on the building page. Generation was already automatic (`rent_arrears_generate_day`).
- ✅ **Async jobs.** Covered by polling the month status after "Create bills" (see above).
  A persistent job table wasn't needed.

## Remaining — needs backend (unitwise_sb)

### Stage 2 — payment reconciliation ✅ (pass 3)
- ✅ **Three records, kept separate.**
  - The **claim** is the existing `RentPaymentSubmission`.
  - The new **received payment** (`RentReceivedPayment`, migration V18) is money the landlord
    says arrived, usually a pasted SMS. One row per reference per agency.
  - The **transaction** is the existing `RentPaymentTransaction`.
  - Neither a claim nor a received payment moves a balance. Confirming one records a
    transaction through the landlord's own payment path, which already handles allocation,
    partial payments and credit carried forward.
- ✅ **Either side can start.**
  - The landlord pastes the message on *Payments to confirm → Record a payment you received*.
    It is linked at once to a waiting report with the same reference **and** amount.
  - Otherwise it waits as Unmatched. When the tenant later reports it, the two are linked
    inside the report's transaction, and the landlord's notification reads
    "Payment matched — ready to verify".
  - Matching never crosses agencies, and stays in one building when that is known.
- ✅ **A reference is used once, everywhere.** `requireUnusedReference` in
  `RentPaymentServiceImpl.recordPayment` covers the desk, approvals, matches, assignments and
  M-Pesa callbacks. A tenant reporting an already-recorded reference gets a 409. Entering a
  received payment twice gets a 409.
- ✅ **Discrepancies are never matched automatically.** A reference that matches with a
  different amount appears under the payment as "Amount differs" with a **Link** button. When
  several reports share a reference, the landlord links one explicitly. Confirming records the
  amount that actually arrived.
- ✅ **Concurrency.** The received payment and the claim are both row-locked
  (PESSIMISTIC_WRITE) while being decided, and `@Version` is on every row.
- ✅ **Actions.** Confirm (approves the linked report), Not this report (unmatch), Assign to a
  tenant (a parent or spouse paid and nobody reported it), Set aside with a reason. Approving
  or refusing a report from the claims list keeps a linked received payment in step
  (`onDecided`).
- ✅ **UI.** Count tabs Needs review / Matched / Unmatched / Resolved, the paste panel,
  side-by-side "Tenant reported | You received" cards, and "✓ Matches your record" on
  reports in the review list. Parser unit test: `PaymentMessageParserTest`.
- ✅ (pass 6) **Rent per room** marks rows with reports still waiting: "Reported KES X", or "✓ Matched KES X" when one already matches a payment you entered. The marker links to Payments to confirm.
- ⏭ **Not done.** No allocation of one
  transaction across several months (an overpayment carries forward as credit instead, as you
  asked).

### Stage 3 — M-Pesa PayBill references and STK push ✅ (pass 4)
- ✅ **A payment reference per room** (`building_floor_rooms.payment_reference`, migration V19).
  - Format: building initials plus the room, e.g. `DC102` or `KIL3`. At most 12 characters,
    unique across the platform.
  - Assigned once and kept through renames and re-lets. Every existing room gets one at
    startup; a new room gets one on first use.
  - Tested in `PaymentReferenceServiceTest`.
- ✅ **Tenant "Pay by M-Pesa"** now shows the room reference as the Paybill account number,
  with "Always use DC102 — matched to your room automatically". A building or agency that sets
  its own account number (a bank PayBill) keeps it.
- ✅ **Rent per room** shows each room's reference under the room name.
- ✅ **PayBill C2B to rent.** The platform's single C2B confirmation URL now checks the account
  number first. A room reference goes to `RentPaybillService`; anything else goes to the shop
  as before.
  - The money is stored first as a received payment (source MPESA_C2B, provider-verified).
  - It is then recorded automatically against the room's one active tenant, for the month it
    was paid in, or the next month if that one is settled. If the tenant had reported it, their
    report is approved instead.
  - The tenant is notified "Payment received … receipt ready".
  - If the room has no single active tenant, or nothing is owed, it stays **Unmatched** in
    Payments to confirm, marked "Confirmed by Safaricom", for the landlord to assign.
  - Idempotent on the M-Pesa receipt, and each step commits on its own, so the money is never lost.
- ✅ **STK push** (already built) now sends the room reference as AccountReference instead of
  `RENT<id>`. The tenant dashboard bill has a "Pay with M-Pesa" button that opens the existing
  prompt on Balance & statements.

**To switch it on (operator):** `MPESA_ENABLED=true`, shortcode/keys/passkey,
`MPESA_C2B_CONFIRMATION_URL=https://<host>/v1/payments/mpesa/c2b/confirmation/<secret>`,
`MPESA_RENT_CALLBACK_URL`, `MPESA_CALLBACK_SECRET`. Then register the URLs once with
`POST /v1/payments/mpesa/c2b/register`. Tenants pay to `mpesa.short-code`, so set the
building's or agency's Paybill to that number.

### Stage 3b — each agency's own PayBill ✅ (pass 5)
- ✅ **Daraja credentials per agency, with optional per-building overrides**
  (`mpesa_collection_accounts`, migration V20).
  - Type (PayBill or till), number, environment, consumer key, secret and passkey.
  - Secrets are AES-256-GCM encrypted (`SecretCipher`, key `SECRETS_ENCRYPTION_KEY`) and never
    returned; the card shows only a "••••3fa1" hint.
  - A shortcode can belong to only one account on the platform.
  - Managed with AGENCY_UPDATE from the **M-Pesa collection** card on the agency page and the
    building page.
- ✅ **Connect.** Registers UnitWise's C2B confirmation URL with Safaricom using the agency's own
  app. The status (Connected / Not connected / Failed + reason) is stored on the account.
  Editing the number or credentials resets it to Not connected.
- ✅ **Which number a building uses, most specific first:**
  1. the building's own account
  2. the PayBill typed in the building's details
  3. the agency's account
  4. the PayBill typed in the agency's profile
- ✅ **Routing by the PayBill that was paid.**
  - Payments to an agency's connected PayBill always belong to that agency's rent. A room
    reference counts only if it is that agency's room (and that building's, for an override).
  - A wrong or missing account number waits under Unmatched in that agency. This replaces
    phone matching for connected PayBills.
  - Payments to the platform shortcode behave as before.
- ✅ **STK push goes through the building's connected PayBill.** The status check asks the same
  app (`rent_payment_mpesa.collection_account_id`). A building whose number isn't connected gets
  pay-by-hand instructions for **its own** number.
- ✅ **No false promise.** The tenant's card says "recorded automatically, no need to report it"
  only when the number is connected. Otherwise it says to report the payment after paying.
  Buy Goods tills show till steps with no account number.
- ✅ **Pasted messages read the account number.** "Account Number DC102" or "for account DC102"
  suggest the room's tenant; "Assign to <name>" records it in one click. This works for pasted
  messages and for unplaced Safaricom payments alike.
- ✅ **Manual pasting still works everywhere,** connected or not.
- Tests: `SecretCipherTest`, plus a parser case for the PayBill owner's notification.

**Setup:** `SECRETS_ENCRYPTION_KEY` (`openssl rand -base64 32`) and the platform's
`MPESA_C2B_CONFIRMATION_URL` / `MPESA_RENT_CALLBACK_URL` / `MPESA_CALLBACK_SECRET`. Every agency's
app calls back to these same URLs, routed by shortcode. Agencies then add their keys and press
Connect.

**Not done**
- **Phone-number matching** for the platform shortcode (only the shop can tell whether such a
  payment is an order).
- **QR / downloadable payment card.**
- **Match-confidence scores.**
- **Daraja Transaction Status** (verifying a pasted code with Safaricom) per agency. It needs
  each agency's initiator credentials.

### Later (marked TODO, not v1)
- Super Admin reconciliation oversight page (unmatched, duplicates, exceptions across agencies).
- Super Admin "all tenants" context: Agency → Building → Floor → Room → Tenant.
- ✅ (pass 6) Pending reports on the agency's rent card: "N reported payments to confirm · M matched", kept separate from the collected figures. *Still to do: previous-month comparison.*

---

## Separate asks in prompt4.txt
- **Landing page modelled on rentaldesk.co.ke, and a feature-gap review of the awasam-8 demo.**
  This needs browsing the live sites, which hasn't been done yet. Do it as its own task.
- **skills.md:** not touched. It holds portable Angular rules only, never business logic.



//TODOLATER: rentaldesk demo review
