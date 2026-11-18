## Features still missing

### From prompt-todo.txt (the RentalDesk gap list)

1. Bulk import does not exist: there is no rooms-sheet download, no upload of tenants with rent and opening balances, and no preview with an error list.
2. a rent roll, a collection report and a deposits-held summary are not built; arrears ageing already exists on the rent dashboard.
4. Bank statement import (CSV, Excel or PDF), matching against bills, and duplicate detection across M-Pesa, bank and manual entries are not built; only per-reference duplicate checks exist.
7. Move-out has no checklist or inspection record with photos and deductions; deposits can only be refunded or kept.
8. Agencies cannot edit their SMS, WhatsApp or email message templates.
9. Building announcements go out through chat broadcasts, but there is no delivery log showing who received or read them.
10. Sign in with Google and WhatsApp one-time codes are not available; phone OTP goes by SMS only.

### From the module reviews (prompt3, prompt5, prompt6, prompt7, prompt8)

13. The audit log has a backend API (`AuditController`) but no screen to read it, so the admin, rent-term, M-Pesa and template history asked for in prompt3 cannot be seen.
15. Maintenance has no internal staff notes separate from what the tenant sees.
16. Subscription invoices cannot be downloaded as PDF.
18. The plan form has no per-limit "Unlimited" switch, so a blank field still means unlimited.
20. Tenants cannot set how long a profile share lasts ("Access lasts"). - DEFAULT TO 1 WEEK VALIDITY
22. Addresses have no map pin or "Use my location", and estates or streets missing from the list cannot be typed in.
23. Floors cannot have different room counts at creation. - PROVIDE THIS OPTION

### Partly done

25. Owner statements, payouts and the landlord view are built, but owners linked before the role change must be given sign-in again.
26. Promises to pay are built, but the "owes now" figure leaves out utility charges.
27. Arrears ageing exists only on the rent dashboard; it cannot be exported as a report.
28. The landing page FAQ still says Excel import is not available - REMOVE THIS FROM LANDINGPAGE ONLY RETAIN THE EXPORT FEATURE

### UI review items still open (not re-verified)

29. prompt.txt (7 Nov) listed about 45 small open items: zero-value tiles, "owing" versus "Balance" wording, rooms written without the "Room" prefix, faint section labels, inputs without thousand separators, no "Load more" on All payments, and forms without inline validation or unsaved-change guards.
30. prompt5.txt asked for a Pay button on unpaid tenant bills, year and status filters with totals on the tenant payments page, and a "Request help" path on every error.

## Conventions to replicate everywhere - ALSO SHOULD BE ADDED/UPDATED TO SKILLS.MD FILE IF IT DOES NOT EXIST

These patterns already work well in some places; the counts show where they are not yet applied.

### Frontend
1. Format money in one way. `formatCurrency` is used in 50 files, the `money` pipe in 19, and local `kes()` or `money()` helpers in 44; pick one and use it everywhere.
2. Make amount alignment a single global class. 30 components each define their own `.num { text-align: right; tabular-nums }`.
3. Put date helpers in the shared utilities. `today()` or `isoDay()` is written out in 4 files, and `monthBounds` repeats the existing `monthRange` utility.
4. Make the paired-field grid (`.pairs`) used in 6 dialogs a shared form class, so dialog fields sit side by side the same way everywhere.
5. Retry every GET twice and never retry a write. tenants.service, ecommerce.service, housing.service and eight other services still have GETs without retry.
6. Give every list an "Export CSV" button through `downloadCsv` and `fetchAllPages`. 12 of 35 list pages have one; tenants, leases, applications and owners have it, but buildings, agencies, users and orders do not.
7. Ask through `ConfirmService` before anything destructive. The rich-text editor still uses the browser's `alert()` three times.
8. Use colour tokens in component styles, never hex values. 15 components still contain hex colours. - DEFINE COLORS AS VARIABLES IN GLOBAL STYLES FILE AND REUSE THEM ACROSS THE ENTIRE PROJECT

9. Lead every money page with a row of tappable tiles that act as filters (`kpi kpi--button`, with `kpi--active` when on).
10. Give every page the same skeleton: `app-context-guard`, then `app-section-card` with its actions slot, then loading, error and empty states in that order. Empty states should say what to do next.
11. Format a status through one table that maps it to a label and tone (as `PROMISE_STATUS` and `STATEMENT_STATUS_LABELS` do), never with ad-hoc `@if` chains.
12. Load decorations, such as follow-up chips, after the main list and best-effort, so a failed side request never blanks the page.
13. Use one dialog shape: `app-dialog` with a form id, the primary button first in `dialog-actions`, and the API error shown inline with `app-error-card`, not in a toast.
14. Gate visibility by permission, with role names used only for audience (tenant, landlord). Visibility that depends on a mode, such as owners, goes through one computed flag on `ActiveContextService`.

### Backend

15. Clean free text with `TextSanitizer.plain` before saving. Only 4 of 52 services do so today; names, notes, descriptions and references everywhere else are stored as typed.
16. Change status only through `transitionTo` with an allowed-moves table. 6 entities do this, while 128 `setStatus` calls change status directly.
17. Soft delete with `markDeleted()`. 25 repository calls still hard delete; keep those only where a unique key forces it, such as agency admins, and say why in a comment. -  SOME CASES I NEED TO ACTUALLY DELETE


18. Throw the project's own exceptions (`BadRequestException`, `ResourceNotFoundException`) rather than `RuntimeException` or `IllegalStateException`, which appear 15 times and reach users as 500 errors.
19. Return DTOs, never entities, from controllers. About 13 endpoints return entity types directly.
20. Never put `@Data` on an entity: it breaks lazy loading and equality. 5 entities still use it.
21. Log through `AppLogger`. One class still uses `@Slf4j`.
22. Read the caller's buildings with `owningAgencyBuildingIds`, falling back to all of the agency's buildings for platform-wide holders, as the expenses, owners and follow-up services do. List and summary endpoints should never trust a building id from the client.
23. Choose staff notification recipients by permission through `AgencyStaffNotifier`. Read-only roles such as `LANDLORD` are excluded in that single query, never at each caller.
