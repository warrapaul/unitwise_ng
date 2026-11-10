import { floorLabel, roomTitle } from '../../utils/format.util';
import { MoneyPipe } from '../../pipes/money.pipe';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { HousingService } from '../../../features/housing/housing.service';
import { BuildingFloorDetail, RoomPreview } from '../../../features/housing/models/housing.models';
import { extractErrorMessage } from '../../utils/error-message.util';
import { HumanLabelPipe } from '../../pipes/human-label.pipe';

/** Numeric-aware so room "A2" sorts before "A10" rather than after it. */
const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function roomLabel(room: RoomPreview): string {
  return roomTitle(room.name || (room.roomNumber !== null && room.roomNumber !== undefined ? String(room.roomNumber) : `#${room.id}`));
}


/**
 * Picks a room out of a building, laid out the way the building is: floors in
 * order, rooms by name within each.
 *
 * A flat `<select>` of "Room 1 … Room 18" asks the operator to hold the
 * building's shape in their head. They know it as "the second room on floor 3",
 * so the picker shows floors as sections and rooms as targets, each carrying the
 * one fact that decides the choice — whether it is vacant.
 */
@Component({
  selector: 'app-room-picker',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => RoomPickerComponent),
    multi: true
  }],
  imports: [MoneyPipe, HumanLabelPipe],
  host: { '(document:pointerdown)': 'onDocumentPointer($event)' },
  template: `
    <div class="picker" (focusout)="onFocusOut($event)">
      <button
        type="button"
        class="picker__control"
        [disabled]="disabled()"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        (click)="toggle()"
        (keydown.escape)="close()"
      >
        <span class="picker__value" [class.picker__value--empty]="!selected()">
          {{ selected() ? selectedLabel() : placeholder() }}
        </span>
        <span class="field-caret" [class.field-caret--open]="open()" aria-hidden="true"></span>
      </button>

      @if (open()) {
        <!-- The picker usually sits in a label, which treats clicks in here as clicks on the control and toggles it. -->
        <div class="picker__panel" role="listbox" (keydown.escape)="close()" (click)="$event.preventDefault()">
          @if (loading()) {
            <p class="muted">Loading rooms…</p>
          } @else if (error()) {
            <p class="error-text">
              {{ error() }}
              <button type="button" class="btn btn-secondary btn-sm" (click)="reload()">Retry</button>
            </p>
          } @else if (floors().length === 0) {
            <p class="muted">This building has no rooms yet.</p>
          } @else {
            <input
              class="picker__search"
              type="text"
              [value]="term()"
              placeholder="Filter rooms…"
              (input)="onTerm($event)"
            >

            <div class="picker__rooms">
              @for (floor of visibleFloors(); track floor.id) {
                <section class="floor">
                  <h4>{{ floorName(floor) }}</h4>
                  <div class="floor__rooms">
                    @for (room of floor.rooms ?? []; track room.id) {
                      <button
                        type="button"
                        class="room"
                        role="option"
                        [attr.aria-selected]="value() === room.id"
                        [class.room--selected]="value() === room.id"
                        [class.room--taken]="!isVacant(room)"
                        [disabled]="vacantOnly() && !isVacant(room) && value() !== room.id"
                        [attr.title]="vacantOnly() && !isVacant(room) ? 'Occupied: a room has one tenancy at a time' : null"
                        (click)="$event.preventDefault(); choose(room)"
                      >
                        <span class="room__name">{{ label(room) }}</span>
                        <span class="room__meta">
                          {{ room.monthlyRent | money }}
                          @if (!isVacant(room)) {
                            · {{ room.status | humanLabel }}
                          }
                        </span>
                      </button>
                    }
                  </div>
                </section>
              }

              @if (visibleFloors().length === 0) {
                <p class="muted">No room matches that.</p>
              }
            </div>
          }
          <!-- Picking a room closes the panel; this is the way out without changing the choice. -->
          <div class="picker__foot">
            @if (clearable() && value() !== null) {
              <button type="button" class="btn btn-text btn-sm" (click)="$event.preventDefault(); clearChoice()">Any room</button>
            }
            <button type="button" class="btn btn-secondary btn-sm" (click)="$event.preventDefault(); close()">Done</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @media (min-width: 701px) { :host-context(.filters) .picker__panel { left: auto; } }
    .room:disabled { opacity: 0.5; cursor: not-allowed; }
    .picker__foot { display: flex; justify-content: flex-end; padding-top: var(--space-2); border-top: 1px solid var(--border); }
    .picker {
      position: relative;
      display: block;
      width: 100%;
    }

    .picker__control {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      width: 100%;
      min-height: 2.7rem;
      padding: var(--space-2-5) var(--space-3);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .picker__value--empty {
      color: var(--text-muted);
    }

    .picker__caret {
      color: var(--text-muted);
      font-size: var(--text-2xs);
    }

    /*
     * A popover, not a modal: picking a room is a detail of the form behind it,
     * and blocking the page to choose one would lose the context that makes the
     * choice obvious.
     */
    .picker__panel {
      position: absolute;
      z-index: 40;
      top: calc(100% + 0.3rem);
      left: 0;
      right: 0;
      /* In a narrow filter column the rooms need more width than the field: grow, and open leftwards. */
      min-width: min(22rem, calc(100vw - 2rem));
      display: grid;
      gap: var(--space-1-5);
      max-height: 20rem;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }

    .picker__search {
      width: 100%;
      padding: var(--space-2) var(--space-2-5);
      border-radius: var(--radius-xs);
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
    }

    .picker__rooms {
      display: grid;
      gap: var(--space-2);
    }

    .floor h4 { margin: 0 0 var(--space-1); font-size: var(--font-label); font-weight: var(--weight-semibold); color: var(--text-muted); }

    .floor__rooms {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 6.5rem), 1fr));
      gap: var(--space-1-5);
    }

    .room {
      display: grid;
      gap: var(--space-0-5);
      padding: var(--space-1-5) var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .room:hover {
      border-color: var(--border-strong);
    }

    .room--selected {
      border-color: var(--primary);
      background: var(--surface-2);
      box-shadow: 0 0 0 2px var(--primary-ring);
    }

    /* Occupied rooms stay selectable — a landlord may be booking ahead — but
       must not read as free at a glance. */
    .room--taken .room__name {
      color: var(--text-muted);
    }

    .room__name {
      font-weight: var(--weight-semibold);
      font-size: var(--text-sm);
    }

    .room__meta {
      font-size: var(--text-2xs);
      color: var(--text-muted);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomPickerComponent implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /*
   * Route params arrive as strings and stored records as numbers, and both are
   * valid callers — the service only interpolates these into a URL. Accepting
   * either here beats a `Number(...)` at every call site.
   */
  readonly agencyId = input<number | string | null | undefined>(null);
  readonly buildingId = input<number | string | null | undefined>(null);
  readonly placeholder = input('Select a room');
  /** For a new tenancy: occupied and reserved rooms are shown, greyed, but cannot be picked. */
  readonly vacantOnly = input(false);
  /** For a filter: offers "Any room", which sets the value back to null. */
  readonly clearable = input(false);

  clearChoice(): void {
    this.value.set(null);
    this.onChange(null);
    this.onTouched();
    this.close();
  }

  private readonly housing = inject(HousingService);

  readonly value = signal<number | null>(null);
  readonly open = signal(false);
  readonly term = signal('');
  readonly disabled = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly rawFloors = signal<BuildingFloorDetail[]>([]);

  /** Floors bottom-up, rooms by name — the same ordering the building page uses. */
  readonly floors = computed<BuildingFloorDetail[]>(() =>
    [...this.rawFloors()]
      .sort((a, b) => (a.floorNumber ?? 0) - (b.floorNumber ?? 0))
      .map((floor) => ({
        ...floor,
        rooms: [...(floor.rooms ?? [])].sort((a, b) => COLLATOR.compare(roomLabel(a), roomLabel(b)))
      }))
  );

  /** The chosen room, with the floor it sits on — the label the trigger shows. */
  readonly selected = computed(() => {
    const id = this.value();
    if (id === null) {
      return null;
    }

    for (const floor of this.floors()) {
      const room = (floor.rooms ?? []).find((candidate) => candidate.id === id);
      if (room) {
        return { room, floor };
      }
    }

    return null;
  });

  readonly selectedLabel = computed(() => {
    const chosen = this.selected();
    if (!chosen) {
      return '';
    }

    // The room first: it is what was chosen; the floor only places it.
    return `${roomLabel(chosen.room)} · ${floorLabel(chosen.floor.name, chosen.floor.floorNumber)}`;
  });

  /** Floors with no matching room drop out entirely rather than showing empty. */
  readonly visibleFloors = computed<BuildingFloorDetail[]>(() => {
    const term = this.term().trim().toLowerCase();
    if (!term) {
      return this.floors();
    }

    return this.floors()
      .map((floor) => ({
        ...floor,
        rooms: (floor.rooms ?? []).filter((room) => roomLabel(room).toLowerCase().includes(term))
      }))
      .filter((floor) => (floor.rooms ?? []).length > 0);
  });

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    effect(() => {
      const agencyId = this.agencyId();
      const buildingId = this.buildingId();
      if (agencyId === null || agencyId === undefined || buildingId === null || buildingId === undefined) {
        this.rawFloors.set([]);
        return;
      }

      void this.load(agencyId, buildingId);
    });
  }

  reload(): void {
    const agencyId = this.agencyId();
    const buildingId = this.buildingId();
    if (agencyId !== null && agencyId !== undefined && buildingId !== null && buildingId !== undefined) {
      void this.load(agencyId, buildingId);
    }
  }

  toggle(): void {
    if (this.disabled()) {
      return;
    }

    this.open.update((value) => !value);
  }

  close(): void {
    this.open.set(false);
    this.term.set('');
  }

  /** A tap anywhere else closes it. focusout alone misses phones, where tapping a button does not focus it. */
  onDocumentPointer(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.onTouched();
      this.close();
    }
  }

  /** Dismiss only when focus leaves the component, not when it moves inside it. */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) {
      return;
    }

    this.onTouched();
    this.close();
  }

  onTerm(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
  }

  choose(room: RoomPreview): void {
    this.value.set(room.id);
    this.onChange(room.id);
    this.onTouched();
    this.close();
  }

  label(room: RoomPreview): string {
    return roomLabel(room);
  }

  floorName(floor: { name?: string | null; floorNumber?: number | null }): string {
    return floorLabel(floor.name, floor.floorNumber);
  }

  isVacant(room: RoomPreview): boolean {
    return (room.status ?? 'VACANT').toUpperCase() === 'VACANT';
  }

  writeValue(value: number | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  /** Coerced once here rather than at every call site; the service takes ids. */
  private async load(rawAgencyId: number | string, rawBuildingId: number | string): Promise<void> {
    const agencyId = Number(rawAgencyId);
    const buildingId = Number(rawBuildingId);
    if (!Number.isFinite(agencyId) || !Number.isFinite(buildingId)) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const building = await firstValueFrom(this.housing.getBuilding(agencyId, buildingId));
      this.rawFloors.set(building.floors ?? []);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
      this.rawFloors.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
