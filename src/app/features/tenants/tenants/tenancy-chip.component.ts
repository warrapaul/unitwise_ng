import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MyTenanciesStore } from './my-tenancies.store';

/**
 * Where a tenant is, in the header: "Room 1-2 · Acacia Court". With more than one tenancy it is
 * the switch between them, and Home, Rent and Payments follow it.
 */
@Component({
  selector: 'app-tenancy-chip',
  standalone: true,
  template: `
    @if (store.tenancies().length > 1) {
      <label class="chip chip--pick">
        <span class="visually-hidden">Tenancy</span>
        <select [value]="store.selectedId()" (change)="store.select(+$any($event.target).value)">
          @for (tenancy of store.tenancies(); track tenancy.id) {
            <option [value]="tenancy.id" [selected]="tenancy.id === store.selectedId()">{{ label(tenancy.roomName, tenancy.buildingName) }}</option>
          }
        </select>
      </label>
    } @else if (store.selected(); as tenancy) {
      <span class="chip" [title]="label(tenancy.roomName, tenancy.buildingName)">{{ label(tenancy.roomName, tenancy.buildingName) }}</span>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; max-width: 100%; }
    .chip { display: inline-flex; align-items: center; max-width: 100%; min-height: 2.5rem; padding: 0 var(--space-3);
            border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2);
            font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chip--pick { padding: 0; }
    .chip--pick select { min-width: 0; max-width: 100%; height: 2.5rem; padding: 0 var(--space-6) 0 var(--space-3); border: 0; background-color: transparent;
                         font: inherit; color: inherit; text-overflow: ellipsis; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenancyChipComponent implements OnInit {
  readonly store = inject(MyTenanciesStore);

  ngOnInit(): void {
    void this.store.load();
  }

  label(room: string | null | undefined, building: string | null | undefined): string {
    return [room ? `Room ${room}` : null, building].filter(Boolean).join(' · ') || 'Your home';
  }
}
