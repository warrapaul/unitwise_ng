# Work plan — prompt5.txt (tenant management)

Status key: ✅ done · 🔧 this pass · ⏭ later / TODOLATER · ❓ your decision

## What the code already does (checked against the review)
- **Manual creation:** creates the person's login account (phone or email match) and the tenancy.
  It refuses an unavailable room and prefills rent and deposit from room → building → agency,
  editable.
- **One person, many tenancies:** one tenancy per person per room; several rooms are allowed
  (shop + house).
- **Tenancy state machine:** a transition table on `TenantStatus`.
- **Combined approve → lease → move-in:** one atomic transaction (`verifyAndGenerateLease`). A
  lease failure rolls the verification back.
- **Share codes:** SecureRandom, stored hashed, short expiry, one-time (hash cleared on redeem),
  revocable, expired codes swept, agency restriction enforced.
- **Initial payments:** recorded through the normal payment path, which refuses a reused
  reference anywhere in the agency (prompt4 Stage 2).
- **Documents and verification:** verification works without documents (checked in person).

## P0 — integrity (backend + the UI that exposes it)
1. ✅ **One room, one onboarding** (`RoomHoldGuard`, locked room row; also re-checked at verification). A room offered to someone (invitation, manual entry, share
   code) is held. Another offer for it is refused with who holds it: "choose a different room
   or cancel that invitation". The room row is locked during the check, so concurrent requests
   can't both win.
2. ✅ **Invitation lifecycle** (V21: `CANCELLED`, `invitation_expires_at`; `InvitationExpiryJob` hourly; cancelling also withdraws the pending profile request). New status CANCELLED. The landlord can cancel or resend.
   Invitations expire after 14 days (daily job), which releases the room. A cancelled or
   expired invitation can't be accepted. *Answers "what if a tenant never accepts and another is
   invited to the same room": the room is held for up to 14 days or until cancelled.*
3. ✅ **Manual entry is verified on creation** (`createManualTenancy`; finish = RESERVE by default, or MOVE_IN; "prepare the lease" is done from the tenant page) (your note: the landlord's role). The last step
   chooses what happens next, in one atomic step: **Reserve the room** / **Move in now** /
   **Prepare the lease** (lease can be uploaded signed on paper). The tenancy becomes active on
   landlord approval, as you decided.
4. ✅ **Duplicate check within the agency only** (`GET /v1/tenants/agency/{id}/possible-duplicates`, shown after step 1 and on review). A phone, national ID or email already on a
   tenancy in this agency gives the warning "already a tenant in Room X — this adds another
   tenancy". It's allowed, since one person may rent several rooms. Nothing global.
5. ✅ **Rate limits** (`UserActionThrottle`: share codes 10/min, uid lookup 20/min) on share-code redemption and Unitwise ID lookup, per user.

## P1 — workflow UI
6. ✅ **Rename the tabs:** Create manually / Use a share code / Invite existing renter, each
   with one line on what it does.
7. ✅ **Manual form as a step wizard:**
   1. Person
   2. Room and terms (prefilled)
   3. Emergency contact
   4. Money received (optional, explicitly confirmed)
   5. Review and finish
8. ✅ **Agreed vs received.** Terms are "agreed"; receipts sit behind an explicit "I have
   received this money" step and never come from the agreed figures.
9. ✅ **Invitation copy** (also shows the proposed rent and how long it stays open): accepting shares their whole renter profile with this agency. It is
   not signing a lease or paying.
10. ✅ **Waiting banner** (also says until when the room is held): "Continue as a manual record" (was "Proceed without their
    acceptance"), Cancel invitation, Resend.
11. ✅ **Share code (renter side)** (the agency-name lookup already existed): says plainly it grants access to the renter profile only,
    never the account, and that no further approval is asked. The agency code shows the agency
    name before generating.
12. ✅ **Tenant list** (`TenantListEnricher`, batched per page).
    - New columns: agreed rent; **This month** (Paid / Part paid / Not paid yet / Overdue / Not billed, with the amount left, kept separate from the tenancy status); lease dates or "periodic", plus "Awaiting signature".
    - Phone and email share one column.
    - The status filter is grouped into Onboarding / Living here / Ended, and now includes Cancelled.
    - *Not done:* filtering by payment standing (needs a server-side query).
13. ✅ (lighter version) **Tenant page "next step" header.**
    - PENDING: "Next: check their details and verify".
    - VERIFIED: "Next: move them in, or prepare the lease", with buttons that jump to the right section.
    - Living tenancies get the actions card below.
    - *Not done:* splitting the 2,600-line page into tabs. That can come later, one section at a time.
14. ✅ **Life after move-in** (`TenancyLifecycleService`).
    - **Give notice / withdraw notice:** expected leaving date.
    - **Record move-out:** with a reason and handover notes. It closes the stay, frees the room, closes the lease and seals document access.
    - **Move to another room:** same tenancy and verification. The new room is held-checked, and agency-only.
    - **Bug fixed:** the edit form used to set Terminated/Evicted without freeing the room, and could change the room with no checks. Both are now refused on the server and removed from the form.
    - Lease renewal and deposit refunds with deductions already existed.

## Not doing (by your notes, or out of scope for this app)
- Permissions / audit visibility in the UI ("why do I need permissions visible").
- Agency-configurable required fields and documents, and required emergency contact
  (TODOLATER).
- Malware scanning, MFA, backups, monitoring — ops and infrastructure, not this codebase pass.
- Provider-verified reconciliation of initial payments — covered by prompt4 Stage 2/3.

## ❓ Open
- Invitation expiry period: 14 days proposed.
