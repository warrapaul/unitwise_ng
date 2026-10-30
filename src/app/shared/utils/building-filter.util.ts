import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { ActiveContextService } from '../../core/services/active-context.service';

/**
 * Makes a page's own building filter the shared context, both ways.
 *
 * Pages already follow the context into their form (an effect patches the control without
 * emitting). This is the way back: when the operator picks or clears a building in the page's
 * filter, the context changes with it, so the next page opens on the same building instead of
 * asking again, and the switcher and the "Showing … only" notice agree with the list.
 *
 * Call from a constructor (it needs an injection context).
 */
export function syncBuildingFilterToContext(control: AbstractControl<number | null>): void {
  const context = inject(ActiveContextService);
  control.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((buildingId) => {
    if (buildingId === context.buildingId()) {
      return;
    }
    if (buildingId === null || buildingId === undefined) {
      context.clearBuilding();
    } else {
      context.selectBuilding(buildingId);
    }
  });
}
