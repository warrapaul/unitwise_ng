import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DeliveryAddress } from '../../ecommerce/models/ecommerce.models';

/**
 * Where a rider is going, in the order they need it: the known building (name, code, where it
 * is, whether someone has been there, whether its entrance is pinned, how to get in), then the
 * recipient's own door — unit, floor, room. The customer's delivery note and the riders' own
 * notes stay labelled apart, so nobody reads one as the other.
 *
 * Without a linked building it shows the recipient part only; the geo context below it offers the
 * nearest building to link.
 */
@Component({
  selector: 'app-destination-card',
  standalone: true,
  template: `
    @let a = address();
    <div class="dest">
      @if (a.geo?.building; as building) {
        <div class="dest__building">
          <div class="dest__head">
            <strong class="dest__name">{{ building.name }}</strong>
            @if (building.code) { <span class="mono muted">{{ building.code }}</span> }
          </div>
          @if (locality()) { <span class="muted">{{ locality() }}</span> }
          <div class="dest__chips">
            @if (a.isVerified) { <span class="status-chip status-chip--success">Field verified</span> }
            @else { <span class="status-chip status-chip--warning">Not verified</span> }
            @if (building.latitude != null) { <span class="status-chip status-chip--neutral">Entrance pin available</span> }
          </div>
          @if (building.description) { <p class="dest__how"><span class="dest__label">How to get in</span>{{ building.description }}</p> }
          @if (building.contactName || building.contactPhone) {
            <p class="dest__how"><span class="dest__label">Caretaker / guard</span>{{ building.contactName }}
              @if (building.contactPhone) { · <a [href]="'tel:' + building.contactPhone">{{ building.contactPhone }}</a> }</p>
          }
        </div>
      }
      <div class="dest__recipient">
        <span class="dest__label">Recipient</span>
        <strong>{{ door() || 'No unit, floor or door recorded yet' }}</strong>
      </div>
      @if (a.deliveryNote) {
        <p class="dest__note"><span class="dest__label">Customer's note</span>{{ a.deliveryNote }}</p>
      }
      @if (a.door?.riderNotes) {
        <p class="dest__note dest__note--rider"><span class="dest__label">Rider notes (internal)</span>{{ a.door?.riderNotes }}</p>
      }
    </div>
  `,
  styles: [`
    .dest { display: grid; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--border);
            border-left: 3px solid var(--primary); border-radius: var(--radius-sm); background: var(--surface); }
    .dest__building { display: grid; gap: var(--space-1); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
    .dest__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); }
    .dest__name { font-size: var(--font-subsection); }
    .dest__chips { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
    .dest__label { display: block; font-size: var(--font-label); font-weight: var(--weight-semibold); color: var(--text-muted); }
    .dest__how, .dest__note { margin: 0; font-size: var(--font-dense); white-space: pre-line; }
    .dest__recipient { display: grid; gap: var(--space-0-5); }
    .dest__note--rider { padding-left: var(--space-2); border-left: 3px solid var(--border-strong); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DestinationCardComponent {
  readonly address = input.required<DeliveryAddress>();

  /** Town and estate, from the registry place the address names. */
  readonly locality = computed(() => {
    const place = this.address().address;
    return [place?.town, place?.estateArea, place?.streetRoad].filter((part) => !!part).join(', ');
  });

  /** "Block C, House 12 · Floor 3 · Door B12": the customer's unit, then what riders recorded. */
  readonly door = computed(() => {
    const a = this.address();
    return [
      [a.address?.buildingHouse, a.unitNumber].filter((part) => !!part).join(', '),
      a.door?.floorNumber ? `Floor ${a.door.floorNumber}` : '',
      a.door?.roomNumber ? `Door ${a.door.roomNumber}` : ''
    ].filter((part) => !!part).join(' · ');
  });
}
