# Work plan — prompt6.txt (chat, maintenance, notifications)

Status key: ✅ done · 🔧 this pass · ⏭ later / TODOLATER

## Already in place (checked against the review)
- **One messaging model with typed threads:**
  - TENANCY (direct, tenant ↔ agency staff)
  - BUILDING_CHANNEL (group, with a posting policy: staff only / everyone)
  - SHOP (customer ↔ shop admins, optionally about an order)
- **Server-side access on every read and post:** a tenancy thread is its tenant plus that building's staff. A channel is the building's *active* tenants plus staff, so former tenants lose access. Staff are scoped per building.
- **Broadcasts:** to buildings or selected rooms, delivered privately into each tenant's own thread, so replies stay private and no recipient list is exposed.
- **Live delivery over WebSocket** (STOMP, `/user/queue/chat`); messages are saved before they are pushed. Unread counts come from per-user read markers, not notification counts.
- **Notifications:** inbox with filters by category (prompt4), deep links, per-topic channel preferences.
- **Maintenance** (prompt4 pass): tenant report and list, staff list with server-validated status moves, "Report an issue", repairs alert on the dashboard.

## Chat — this pass
1. ✅ **Conversation list:** type label on every card (Direct / Building group / Shop), filters (All · Direct · Groups · Shop · Unread) and search.
2. ✅ **Message bubbles:**
   - date separators
   - consecutive messages grouped
   - sender name and role label (Tenant / the staff member's agency role / Shop)
3. ✅ **Idempotent send** (V22 `client_message_id`, unique per sender): a client message id, so a retried send never posts twice.
4. ✅ **Channel history from joining** (unread counts follow the same rule; tenants on notice keep access until they move out): a tenant sees building-group messages from their move-in to that building onward (the review's default). Staff see everything.
5. ✅ **Broadcast targeting:** selected tenants as well as rooms and buildings, and the "this will reach N tenants" count before sending.

## Maintenance — this pass (finance stays in the rent module)
6. ✅ **Charge the tenant for a repair** (`MaintenanceChargeService` in the rent module; needs RENT_ARREAR_WRITE; once per request): an explicit, permissioned action. It creates a one-off charge through the existing rent charge path, named with the request number and a reason, and the request keeps a link to it. Nothing is charged automatically.
7. ✅ **Request detail** (V23; shared `app-maintenance-detail-body`). Reopen became "Problem is back — report again": a follow-up request linked to the old one, since closed requests stay closed by design.
   - location in the property and access preference (tenant form)
   - assignment to a staff member
   - visit date
   - activity timeline (every status change, with who and when)
   - "report again" links a new request to the old one
8. ✅ **Staff overview metrics:** New · Urgent · Overdue · Scheduled · Completed this month. Each is a filter.
9. ✅ **Photos on a request:** up to 6, uploaded by the tenant or staff, stored privately and shown through short-lived links.

## Later
- ⏭ Every maintenance request as its own conversation (your TODOLATER).
- ⏭ **WhatsApp Business Platform:** needs a Meta business account, phone number and token. The design is in the review: one message record with a delivery record per channel, webhooks verified and de-duplicated.
- ⏭ Group settings beyond the posting policy (who manages members, attachments allowed, scheduled or expiring broadcasts).
- ⏭ Message edit and delete, pinning, full-text search across messages.
- ⏭ Delivery and read receipts per recipient, broadcast read statistics.
- ⏭ Work orders, contractors, cost estimates and expense approvals as their own records.
