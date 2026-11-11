import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../core/services/notification.service';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { phoneValidator } from '../../../shared/utils/phone.validator';
import { AppManagementService } from '../app-management.service';

/** Help & support contacts and the privacy policy every user reads: one record, edited here. */
@Component({
  selector: 'app-app-info-page',
  standalone: true,
  imports: [ReactiveFormsModule, LoadingStateComponent, ErrorStateComponent, ErrorCardComponent, FieldErrorComponent, SectionCardComponent,
    FormFeedbackDirective, DateDisplayDirective],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="load()" />
    } @else {
      <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <app-section-card title="Help & support" subtitle="Shown on the Help page, for problems with the app.">
          <div class="grid-auto">
            <label class="field"><span>Phone</span><input type="tel" inputmode="tel" formControlName="supportPhone">
              <app-field-error [control]="form.controls.supportPhone" label="Phone" /></label>
            <label class="field"><span>WhatsApp</span><input type="tel" inputmode="tel" formControlName="supportWhatsapp">
              <app-field-error [control]="form.controls.supportWhatsapp" label="WhatsApp" /></label>
            <label class="field"><span>Email</span><input type="email" inputmode="email" formControlName="supportEmail">
              <app-field-error [control]="form.controls.supportEmail" label="Email" /></label>
            <label class="field"><span>Hours</span><input formControlName="supportHours" maxlength="150"></label>
          </div>
          <label class="field field--wide"><span>Note on the Help page</span><textarea formControlName="helpText" rows="3" maxlength="2000"></textarea></label>
        </app-section-card>

        <app-section-card title="Privacy policy" subtitle="Plain text; blank lines start a new paragraph.">
          <label class="field field--wide"><span>Policy</span><textarea formControlName="privacyPolicy" rows="16"></textarea></label>
          <label class="field"><span>Last updated</span><input type="date" appDateDisplay formControlName="privacyUpdatedOn"></label>
          <small class="hint">Left blank, it moves to today whenever the policy text changes.</small>
        </app-section-card>

        @if (saveError(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
        <div class="button-row">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save' }}</button>
        </div>
      </form>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppInfoPageComponent implements OnInit, HasUnsavedChanges {
  private readonly service = inject(AppManagementService);
  private readonly toasts = inject(NotificationService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = inject(NonNullableFormBuilder).group({
    supportPhone: ['', [phoneValidator()]],
    supportWhatsapp: ['', [phoneValidator()]],
    supportEmail: ['', [Validators.email]],
    supportHours: '',
    helpText: '',
    privacyPolicy: '',
    privacyUpdatedOn: ''
  });

  ngOnInit(): void {
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const info = await firstValueFrom(this.service.getAppInfo());
      this.form.reset({
        supportPhone: info.supportPhone ?? '', supportWhatsapp: info.supportWhatsapp ?? '', supportEmail: info.supportEmail ?? '',
        supportHours: info.supportHours ?? '', helpText: info.helpText ?? '', privacyPolicy: info.privacyPolicy ?? '',
        privacyUpdatedOn: ''
      });
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await firstValueFrom(this.service.saveAppInfo({ ...value, privacyUpdatedOn: value.privacyUpdatedOn || null }));
      this.form.markAsPristine();
      this.toasts.push('success', 'Saved.');
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
