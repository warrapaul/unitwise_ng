# Work plan — prompt5.txt, Tenant app review

Status: ✅ done · 🔧 next · ⏭ later (needs backend or a decision) · 🗂 data only (dummy data, no code change)

## Your notes (top of prompt5.txt)
- ✅ Copying a phone number copies spaces → copy gives `+254700000205`: phone menu, and any
  selected phone number (app-wide copy handler; dates and other numbers untouched).
- ✅ Tenant sidebar missing Rent and Payments → added under Tenancy, same names as the tabs.
- ✅ No Back on Report an issue / Balance & statements → Back on every phone page except Home.

## Structure decided for this pass
- **Rent** = what is owed: this month's bill, balance, Pay, then month-by-month statements.
- **Payments** = money paid: one history, confirmed and reported (pending / rejected) together.
- **Home** = bill → pay → recent payments → who to call. Home, deposit and rules move to My tenancy.

## A. Global and navigation
- ✅ Keep the bottom nav; tabs by role (tenant: Home · Rent · Payments · Repairs · More).
- ✅ One header: Back everywhere but Home.
- ✅ Page titles match the tabs (Rent, Payments, Repairs).
- ✅ Tab bar hidden in focus pages (route data `focus`): edit profile, tenant profile edit, chat thread.
  ✅ Report an issue is its own focus page (E).
- ✅ Tenant copy says landlord, not agency/caretaker (dashboard, Who to call, repairs).
- ✅ Status palette: Submitted = warning, Acknowledged / In progress = info, Cancelled = neutral.
- ✅ "My rent bills" title gone (Payments has no card title); Chat / Notifications title cards removed (F/G).
- ✅ Money as KES 25,000 on Rent (the old statement's raw 25000 / 23240 page is replaced).
- ✅ Header (and sidebar) show the tenant's room; with more than one tenancy it is the switch, and Home / Rent / Payments follow it.
- ✅ Styled chat search, message box and file picker. ⏭ Month/date pickers still the browser's own.

## B. Home — ✅ mostly
- ✅ Order: bill → how to pay → recent payments → who to call. Home, deposit, rules, charges moved to
  My tenancy (Tenancy tab).
- ✅ Welcome card removed for tenants; phone header says "Hi, <name>". Active chip removed.
- ✅ Four shortcuts, 2×2 on a phone: Report an issue · Message landlord · Documents · My tenancy.
- ✅ Bill: no stepper on Home; full-width Pay inside the "Left to pay" panel; "Not final" note in the
  panel with an icon; "Report a payment" as a text link with one line on when to use it; two
  columns (item with its workings under it, amount); Rent shows "Due 5 Nov"; "Paid" not
  "Paid (confirmed…)"; "Left to pay" once; changes list only on Rent.
- ✅ M-Pesa prompt only where an agency admin switched it on: new `PAYMENT_SETTINGS_MANAGE`
  permission (agency-wide, or for one building) to configure M-Pesa accounts; "Tenants can pay by
  M-Pesa prompt" switch per account (V34 `stk_push_enabled`, off by default, needs connected +
  passkey); a building uses its own account or inherits the agency's. No platform-shortcode
  fallback: without such an account the backend answers "pay by hand" (overview `mpesaPromptAvailable`). Otherwise: PayBill / bank steps shown
  open, and the bill's main button is "How to pay" (payments matched automatically) or "Report a
  payment" (they are not).
- ✅ How to pay: late fee says when it applies ("KES 500 if paid after the 8th"); "Pay now" (prompt)
  vs PayBill/bank (folded away); account number shown once; copy buttons labelled "Copy".
- ✅ Payments: one compact list (amount; date · month; method · reference; status; Receipt).
  Reported payments merged in; a confirmed report is not listed twice.
- ✅ Who to call: number + Call/WhatsApp, no copy icon; footer links to Who to call.
- ⏭ Late fee is still never added automatically (known backend gap, in the prompt3 scope).
- 🗂 Business no. 600000 is the sandbox shortcode (data).
- 🗂 "No monthly charges" while the bill has Water — check the overview's charge list against the
  building templates before touching code.

## C. Rent — ✅ mostly
- ✅ Leads with the balance and Pay; month picker loads on change (no Load button); statement
  figures as KES; zero rows hidden; balance is the headline; "Not final" not "Provisional".
- ✅ Pay dialog: amount prefilled with the balance (KES prefix, editable), "You'll get an M-Pesa
  prompt on +254 …" with Change, full-width; waiting / paid / not paid / no answer states with
  polling. Backend: STK request takes `tenantId` and `phoneNumber` (optional).
- ✅ Charges one line each ("12 m³ × KES 120 · October usage"); changes one line each
  ("Added KES 800 · Replacement key · 10 Nov"); Download statement here; All months list.
- ✅ "Paid this month" on the statement.

## D. Payments — ✅ mostly
- ✅ Money paid, newest first, one history; no repeated title; no "Showing 3 of 3"; empty state;
  "KES X paid in 2026" summary.
- ✅ Year filter with the year's total.
## E. Repairs — ✅ mostly
- ✅ List first, Open above Closed, newest first; a progress line (Sent → Seen → Being fixed → Done);
  chevron; reference with Copy inside the request; empty state with the action.
- ✅ Report an issue is its own page (no tab bar): kind and urgency as choices, each urgency
  defined; Emergency shows Call buttons for the building's numbers; place chips; Title required,
  Description optional (backend: description falls back to the title); photos before sending
  (uploaded right after the request is created); Access "Call me first / Agree a time with me /
  Come in if I'm out"; "Your landlord will call you on …"; Submit request; success toast with the
  reference, back to the list with the new request open.
- ✅ Status colours: Submitted amber, Acknowledged / In progress blue, Cancelled grey.

## F. Chat — ✅ mostly
- ✅ No title card for a tenant's inbox; styled search; filters only for kinds that exist; avatar
  initial instead of "Direct / Building group" tags; a tenancy thread reads "Landlord · Room 1-2";
  empty group says "Say hello…" or "Only staff post here"; no in-card Back; full width on a phone;
  own messages tinted; staff role shown as "Landlord" to tenants; auto-growing message box and an
  icon Send button; no tab bar in a conversation.
- ✅ Sender in previews ("You: …", "Amina: …"; backend sends the last sender).
- ⏭ Read receipts, typing, attachments.

## G. Notifications — ✅ mostly
- ✅ One filter row (All, Unread, [Starred for staff], Payments, Tenancy, Repairs, Messages) with
  "Mark all read" beside it; no title card; whole card opens it (and reads it); unread = dot +
  bold; Star / Mark read in a ⋯ menu; relative times; Today / Earlier groups; empty states.
- ✅ Accept / Decline on a sharing-request notification while it is still waiting.
- 🗂 "has been completed. Seed" is seed text.

## H. Drawer — ✅ Rent / Payments added; "Delivery addresses".
- ✅ Help & support and Privacy policy pages, and "Version x.y.z" under Sign out — all from the
  backend app module: new `app_info` record (V33) with support phone / WhatsApp / email / hours,
  a help note and the privacy policy; `GET /v1/app/info` (public) also returns the WEB (else ALL)
  latest version from Version config. Edited at App management → Help & privacy.

## I–L. My tenancy, profile, share code, documents — ✅ mostly
- ✅ Opens on Tenancy; Documents shortcut opens the profile tab.
- ✅ Profile: one action (Edit); National "Add email" / "Add emergency
  contact" prompts (National ID shown like any other field); documents panel; Rental application card (hidden for a sitting tenant unless
  already filled).
- ✅ Profile edit: one action bar at the end (pinned on a phone); fields filled from the account are
  marked; phones shown +254 …; relationship is a list; warning when the legal name or ID changes
  on a completed profile; leave-without-saving guard; saved toast.
- ✅ Rental application (new page): household, work, previous rental; month pickers; income with KES
  and "Prefer not to say"; previous landlord's phone needs their agreement; "Why you left" removed;
  "Anything else" → "Note to landlord".
- ✅ Share code in a dialog: one line per choice, warning on "Any landlord"; Paste; what they see
  (profile always, documents optional); "Code expires in" and a separate "Access lasts"; consent
  checkbox; issued code with its expiry; always shares the profile with its documents; "Shared with" rows split into reason / sees / until.
- ✅ Add document: drop area with limits and Take photo (shared uploader, so every upload in the
  app); ID types photo/PDF only; front then back; privacy line with a lock.

## M. Tenancy tab — ✅ mostly
- ✅ Leads with "Room 1-2 · Acacia Court", landlord and move-in; no "My applications"; Move out
  only when set; "ID check: Not yet" explained; deposit one line when settled; details card with
  "Request a correction"; empty fields hidden; emergency contact one entry; email wraps; lease
  empty state says who prepares it; rent and how to pay, home and charges on the tab.
- ✅ Give notice from the Tenancy tab (earliest day = today + notice period; backend `POST /v1/tenants/my/{id}/notice`). Staff who can see the building's tenants get a "Notice to move out" notification (TENANCY_NOTICE_GIVEN) that opens the tenant.

## N. Data
- 🗂 "No monthly charges" — the server lists the room's active charge templates (room > building >
  agency). Empty means none are active for that room; the Water on the bill can come from a charge
  billed without a template (seed). Check the building's Monthly charges page.
- 🗂 Sandbox paybill 600000, "Next Of Kin" name, "Seed" text, Verified flag on seeded tenants.

## O. States and accessibility — applied as each screen is touched

## Follow-ups (11 Nov)
- ✅ Seed (`scripts/seed/seed.py`): real emergency contacts and notes; David's complete profile with
  both sides of his ID; sharing request includes documents.
- ✅ Menu: house mark, larger section labels, sign-out warns about unsaved work.
- ✅ Notifications: repair updates grouped per request; one title pattern (subject, then state).
- ✅ Profile completeness bar and per-section Complete / Not added.
- ✅ Chips all carry a mark; 44px touch targets; focus held in the open drawer; 200% text holds
  (section card capped to its width — fixes every card).
- ✅ Late fees: agency switch, building Same/On/Off, tenant override, daily job, waive with reason (V35).
- ✅ Document expiry, only when set; status line removed from tiles (V36).
- ✅ Rejected tenancy: reason stored, tenant notified and shown, quick reasons for staff (V37).
  Rejected tenants no longer read as verified.
- ✅ Chat: photos and PDFs (MinIO bucket `chat`, private, 15-minute links), "Seen", sender in previews.
- ✅ Lists: page buttons on desktop; "Load more" on a phone (grows the first page up to 100, then page
  buttons). Three fixed-size lists wired for it (received payments, reported payments, maintenance).
- ✖ Not doing: profile view log, typing indicator, category icons, repair comments/rating, inspections.
