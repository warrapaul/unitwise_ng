# Work plan — prompt7.txt (addresses, delivery geography, rider workflow)

Status key: ✅ done · ⏭ later / TODOLATER

## Already in place (checked against the review)
- **One address hierarchy** (county → sub-county → ward → town → estate → street), shared by building addresses and delivery addresses. Records reference it by id, so renaming an estate changes its displayed name everywhere without breaking orders or buildings (constraint 7).
- **Separate records:** a landlord's building (`buildings`) and a known delivery building (`geo_buildings`) are different records. A delivery address can point at a geo building without any access to tenancy data (§1 rule).
- **Delivery addresses** keep their own coordinates (constraint 4), with an optional link to a known building. Many addresses can share one building (constraint 3).
- **Rider-only door details** (floor, room/door, notes for the next rider) are stored apart from the customer's delivery note. A rider can link an address to a known building from the gate.
- **Verification:** who verified and when, plus "waiting for the customer to confirm" for addresses staff added.
- **Registry duplicates:** a ward already can't repeat a name under the same sub-county.

## Pass 1
### Registry (Super Admin)
1. ✅ **Active / inactive lifecycle** on every level (V24):
   - An inactive place isn't offered when choosing a location for a new address, but existing addresses still show it.
   - The registry shows all places, with inactive ones marked, and can switch a place either way.
2. ✅ **Delete blocked while referenced:** a place still used by any address (or with places under it) can't be deleted. The message says why and suggests marking it inactive instead.
3. ✅ **Duplicates only under the same parent** (your note). The check ignores case and surrounding spaces, on create and on rename. The error names the existing record so the admin can pick it rather than create a copy.
4. ✅ **Registry UI:**
   - an empty state in each column with its own action ("Add the first ward")
   - status (and code where the level has one) in the add/edit form
   - search, selection and scroll kept after an edit

### Known delivery buildings (E-commerce Admin)
5. ✅ **Location type for the pin:** main entrance or gate, customer access point, vehicle drop-off, or building centre. It replaces the free-text "Location" label.
6. ✅ **Specific out-of-region error, checked on the server:** "This point is outside the mapped delivery regions. Move the pin into a covered region or update the region mapping." The form shows the matched region's name when the pin is inside one.
7. ✅ **Landmarks are suggestions, linked explicitly** (V24 `geo_building_landmarks`):
   - several landmarks per building, each with a relationship (near the main entrance, opposite, behind, along the access road) and its distance
   - nothing is linked automatically
8. ✅ **Duplicate warning before saving** (same code, same name nearby, or another building within 30 m). The admin sees the candidates and can still save; nothing merges.
9. ✅ **Inactive buildings aren't offered for new links** (constraint 1). Addresses already linked keep the link and their history.

### Rider and staff address editing
10. ✅ **Compact current address first.** Riders correct one thing rather than re-enter everything:
    - "Edit address" opens the full fields
    - the rider-only section and the known-building section are separate
11. ✅ **Known delivery building section:** shows the linked building's name, code and locality, with Change and Unlink. The customer's own address text isn't overwritten.
12. ✅ **Attributable verification** (constraint 5, V24 `delivery_address_verifications`): each verification records who, when, the type (field visit, phone call, customer confirmed) and the outcome (confirmed, location corrected, couldn't find). The address keeps its last-verified summary, and the history shows on the address. Saving an edit no longer implies verification.
13. ✅ **Rider destination card** on the order: the known building (name, code, locality, field-verified, entrance pin, how to get in), then the recipient's unit, floor and door. The customer's note and the rider notes are labelled apart.
14. ✅ **Customer and internal notes separated** (constraint 6): rider-only fields are never in the customer's own address responses (checked and enforced).

### Customer delivery address form
15. ✅ **Three steps:** 1. Where is it? → 2. Help the rider find you → 3. Delivery contact.
    - Latitude and longitude go under "Advanced location details".
    - The map link or "use my location" is the main way to pin.
    - An unreadable map link is kept as typed, with a reason.
16. ✅ **Kenyan mobile check:** 07…/01…/+254…/254… are accepted and stored as 2547… / 2541…, so every form and rider sees one format.

### Landlord building address
17. ✅ **Formatted address preview before saving**, and clear required (county, sub-county) and optional markers. Saving changes only the address record; the building, its rooms and its contract details stay as they are (§3.1.5, already true).
18. ✅ **Where each contract value comes from** (worked out from the building's own values and the agency's defaults, which the panel already loads): each field in the contract panel says Agency default, Building override or Not configured.

## Later
- ⏭ **Bulk import of the registry:** upload, a validation report, duplicate detection, and a review step before imported places become active (TODOLATER).
- ⏭ **Registry on phones:** a breadcrumb drill-down instead of five columns.
- ⏭ **Map previews with draggable pins** (building entrance, customer pin). Coordinates, map links and "use my location" work today; an embedded map needs a map library and tiles.
- ⏭ **Fuller automatic matching** of addresses to known buildings, using name normalisation, locality context and landmark associations. For now: a suggestion list ordered by distance (§7, first release).
