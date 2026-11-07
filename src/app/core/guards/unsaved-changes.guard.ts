import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmService } from '../../shared/services/confirm.service';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Leaving a half-filled form loses it, so that is asked rather than assumed. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (page) => !page.hasUnsavedChanges()
  || inject(ConfirmService).ask({
    title: 'Leave without saving?',
    message: 'What you have entered here will be lost.',
    confirmLabel: 'Leave',
    cancelLabel: 'Keep editing'
  });
