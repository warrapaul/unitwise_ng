import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDateTime } from '../../../shared/utils/display-date.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { MpesaAccountType, MpesaCollectionAccount, MpesaEnvironment } from '../mpesa-collection.models';
import { MpesaCollectionService } from '../mpesa-collection.service';

/**
 * Where an agency's rent is paid by M-Pesa, with Unitwise connected to it.
 *
 * On the agency page it edits the agency's own Daraja app and lists the buildings that override
 * it; on a building page it edits that building's override, or says which account it inherits.
 * Connected, payments to the number are recorded by themselves and tenants can be sent a prompt;
 * without one, rent is still paid by hand and reconciled by pasting messages.
 */
@Component({
  selector: 'app-mpesa-collection',
  standalone: true,
  imports: [ErrorStateComponent, ReactiveFormsModule, ErrorCardComponent, FieldErrorComponent, LoadingStateComponent, SectionCardComponent,
    StatusChipComponent, FormFeedbackDirective, HumanLabelPipe],
  template: `
    <app-section-card title="M-Pesa collection" [subtitle]="subtitle()">
      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading M-Pesa settings…" />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="load()" />
      } @else {
        @if (own(); as account) {
          @if (!editing()) {
            @if (account.environment === 'SANDBOX') {
              <p class="alert alert-warning" role="status">Sandbox: payments are not live. Switch to Production to collect real rent.</p>
            }
            <dl class="facts">
              <div><dt>{{ account.accountType === 'TILL' ? 'Till' : 'PayBill' }}</dt><dd>{{ account.payableNumber }}</dd></div>
              <div><dt>Environment</dt><dd>{{ account.environment | humanLabel }}</dd></div>
              <div><dt>Consumer key and secret</dt><dd>•••••••• <span class="stored">Stored</span></dd></div>
              <div><dt>Passkey for STK push</dt><dd>@if (account.hasPasskey) { •••••••• <span class="stored">Stored</span> } @else { Not set }</dd></div>
              <div><dt>Status</dt><dd>
                @if (account.status === 'CONNECTED' && account.environment === 'SANDBOX') {
                  <span class="status-chip status-chip--warning">Connected (sandbox)</span>
                } @else { <app-status-chip [status]="account.status" /> }
                @if (account.status === 'CONNECTED' && account.connectedAt) { <span class="muted"> since {{ dateTime(account.connectedAt) }}</span> }
              </dd></div>
            </dl>
            <!-- Prompts are an explicit choice: off until switched on, and only on an account that can send them. -->
            <label class="switch-row">
              <span>
                <strong>Tenants can pay by M-Pesa prompt</strong><br>
                <span class="muted small">
                  @if (!account.hasPasskey) { Add the passkey (Edit) to offer prompts. }
                  @else if (account.status !== 'CONNECTED') { Connect the account first. }
                  @else if (account.stkPushEnabled) { Pay on a tenant's bill sends a prompt to their phone. }
                  @else { Off: tenants pay by PayBill or bank. }
                </span>
              </span>
              <input type="checkbox" role="switch" class="switch" [checked]="account.stkPushEnabled" [disabled]="busy() || !account.hasPasskey || account.status !== 'CONNECTED'"
                     (change)="setPrompts(account, $any($event.target).checked)">
            </label>
            @if (account.status === 'FAILED') {
              <p class="alert alert-warning" role="alert">Safaricom refused it: {{ account.lastError }}</p>
            } @else if (account.status !== 'CONNECTED') {
              <p class="muted small">Saved but not connected — payments to it are not recorded automatically yet.</p>
            }
            <div class="button-row">
              @if (account.status !== 'CONNECTED') {
                <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="connect(account)">
                  {{ busy() ? 'Connecting…' : 'Connect' }}
                </button>
              }
              <button type="button" class="btn btn-secondary btn-sm" (click)="startEdit(account)">Edit</button>
              <button type="button" class="btn btn-text btn-sm btn-danger-outline" [disabled]="busy()" (click)="remove(account)">Remove</button>
            </div>
          }
        } @else if (!editing()) {
          @if (inherited(); as parent) {
            <p>Agency {{ parent.accountType === 'TILL' ? 'till' : 'PayBill' }} {{ parent.payableNumber }}
              @if (parent.environment === 'SANDBOX') { <span class="status-chip status-chip--warning">Sandbox</span> }
              @else { <app-status-chip [status]="parent.status" /> }</p>
            <p class="muted small">{{ parent.promptReady ? 'Tenants here can pay by M-Pesa prompt (set on the agency).' : 'M-Pesa prompts are off for the agency’s account.' }}</p>
          } @else {
            <p class="muted">Not connected. Tenants pay the number in the payment details and you confirm payments by pasting the messages.</p>
          }
          <div class="button-row">
            <button type="button" class="btn btn-secondary btn-sm" (click)="startEdit(null)">
              {{ buildingId() ? 'Override PayBill' : 'Connect a PayBill or till' }}
            </button>
          </div>
        }

        @if (editing()) {
          <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
            <div class="grid-auto">
              <label class="field">
                <span>Type</span>
                <select formControlName="accountType">
                  <option value="PAYBILL">PayBill</option>
                  <option value="TILL">Till (Buy Goods)</option>
                </select>
              </label>
              <label class="field">
                <span>{{ form.controls.accountType.value === 'TILL' ? 'Store number' : 'PayBill number' }}</span>
                <input formControlName="shortCode" inputmode="numeric">
                <app-field-error [control]="form.controls.shortCode" label="The number" />
              </label>
              @if (form.controls.accountType.value === 'TILL') {
                <label class="field">
                  <span>Till number <span class="muted">(if different)</span></span>
                  <input formControlName="tillNumber" inputmode="numeric">
                </label>
              }
              <label class="field">
                <span>Environment</span>
                <select formControlName="environment">
                  <option value="PRODUCTION">Production</option>
                  <option value="SANDBOX">Sandbox (testing)</option>
                </select>
              </label>
            </div>
            <!-- Write-only: stored keys are never shown. Editing keeps them unless "Replace keys" is chosen. -->
            <p class="alert alert-info">Keys come from the app for this PayBill on the Safaricom Daraja portal. They are stored encrypted and cannot be read back.</p>
            @if (own() && !replacingKeys()) {
              <p class="keys-stored">Keys stored <button type="button" class="btn btn-text btn-sm" (click)="startReplacingKeys()">Replace keys</button></p>
            } @else {
              <div class="grid-auto">
                <label class="field">
                  <span>Consumer key</span>
                  <input formControlName="consumerKey" type="password" autocomplete="off">
                  <app-field-error [control]="form.controls.consumerKey" label="Consumer key" />
                </label>
                <label class="field">
                  <span>Consumer secret</span>
                  <input formControlName="consumerSecret" type="password" autocomplete="off">
                  <app-field-error [control]="form.controls.consumerSecret" label="Consumer secret" />
                </label>
                <label class="field">
                  <span>Passkey for STK push</span>
                  <input formControlName="passkey" type="password" autocomplete="off">
                </label>
              </div>
            }
            @if (saveError(); as apiError) {
              <app-error-card [title]="apiError.status === 409 ? 'Already in use' : 'Not saved'" [message]="apiError.message" [details]="apiError.details" />
            }
            <div class="button-row">
              <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="editing.set(false)">Cancel</button>
            </div>
          </form>
        }

        @if (!buildingId() && overrides().length > 0) {
          <h3 class="panel-title">Buildings with their own</h3>
          <ul class="overrides">
            @for (account of overrides(); track account.id) {
              <li><span>{{ account.buildingName || 'Building' }}</span><span class="mono">{{ account.payableNumber }}</span><app-status-chip [status]="account.status" /></li>
            }
          </ul>
        }
      }
    </app-section-card>
  `,
  styles: [`
    .stored { margin-left: var(--space-1); font-size: var(--text-sm); color: var(--text-muted); font-weight: var(--weight-regular); }
    .keys-stored { margin: 0; display: flex; align-items: center; gap: var(--space-2); }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: var(--space-2-5) var(--space-4); margin: 0; }
    .facts div { display: grid; gap: var(--space-0-5); min-width: 0; }
    .facts dt { font-size: var(--text-xs); color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
    .small { font-size: var(--text-sm); }
    .panel-title { margin: var(--space-2) 0 0; font-size: var(--text-sm); font-weight: var(--weight-bold); color: var(--text-muted); }
    .overrides { display: grid; gap: var(--space-1-5); margin: 0; padding: 0; list-style: none; }
    .overrides li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1-5) var(--space-3); }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MpesaCollectionComponent {
  readonly agencyId = input.required<number>();
  /** Set on a building page: the override for that building. */
  readonly buildingId = input<number | null>(null);

  private readonly service = inject(MpesaCollectionService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly accounts = signal<MpesaCollectionAccount[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  /** The account for this page's scope: the agency's own, or this building's override. */
  readonly own = computed(() => this.accounts().find((account) => (account.buildingId ?? null) === this.buildingId()) ?? null);
  /** On a building page with no override: the agency's, which applies. */
  readonly inherited = computed(() => this.buildingId() ? this.accounts().find((account) => !account.buildingId) ?? null : null);
  readonly overrides = computed(() => this.accounts().filter((account) => !!account.buildingId));

  readonly subtitle = computed(() => this.buildingId()
    ? 'Only if this building collects into a different PayBill than the agency.'
    : 'Rent paid to a connected PayBill or till is recorded automatically.');

  readonly form = this.fb.group({
    accountType: 'PAYBILL' as MpesaAccountType,
    shortCode: ['', [Validators.required, Validators.pattern(/^\d{5,10}$/)]],
    tillNumber: '',
    environment: ['PRODUCTION' as MpesaEnvironment, [Validators.required]],
    consumerKey: '',
    consumerSecret: '',
    passkey: ''
  });

  constructor() {
    effect(() => {
      this.agencyId();
      untracked(() => void this.load());
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.accounts.set(await firstValueFrom(this.service.list(this.agencyId(), this.buildingId())));
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  startEdit(account: MpesaCollectionAccount | null): void {
    this.saveError.set(null);
    this.form.reset({
      accountType: account?.accountType ?? 'PAYBILL',
      shortCode: account?.shortCode ?? '',
      tillNumber: account?.tillNumber ?? '',
      environment: account?.environment ?? 'PRODUCTION',
      consumerKey: '',
      consumerSecret: '',
      passkey: ''
    });
    // A new connection needs its keys; an existing one keeps them unless they are replaced.
    this.replacingKeys.set(!account);
    this.setKeysRequired(!account);
    this.editing.set(true);
  }

  readonly replacingKeys = signal(false);

  startReplacingKeys(): void {
    this.replacingKeys.set(true);
    this.setKeysRequired(true);
  }

  private setKeysRequired(required: boolean): void {
    for (const control of [this.form.controls.consumerKey, this.form.controls.consumerSecret]) {
      control.setValidators(required ? [Validators.required] : []);
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (!this.own() && (!value.consumerKey.trim() || !value.consumerSecret.trim())) {
      this.saveError.set({ status: 0, errorCode: 'VALIDATION_ERROR', message: 'The consumer key and secret are required.', details: [] });
      return;
    }
    this.busy.set(true);
    this.saveError.set(null);
    try {
      const saved = await firstValueFrom(this.service.save(this.agencyId(), {
        buildingId: this.buildingId(),
        accountType: value.accountType,
        shortCode: value.shortCode.trim(),
        tillNumber: value.accountType === 'TILL' ? value.tillNumber.trim() || null : null,
        environment: value.environment,
        consumerKey: value.consumerKey.trim() || null,
        consumerSecret: value.consumerSecret.trim() || null,
        passkey: value.passkey.trim() || null
      }));
      this.replace(saved);
      this.editing.set(false);
      this.notifications.push('success', saved.status === 'CONNECTED' ? 'Saved.' : 'Saved — now connect it.');
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Switches prompts on or off; the rest of the account stays as it is (blank secrets keep the stored ones). */
  async setPrompts(account: MpesaCollectionAccount, on: boolean): Promise<void> {
    this.busy.set(true);
    try {
      const saved = await firstValueFrom(this.service.save(this.agencyId(), {
        buildingId: account.buildingId ?? null,
        accountType: account.accountType,
        shortCode: account.shortCode,
        tillNumber: account.tillNumber ?? null,
        environment: account.environment,
        stkPushEnabled: on
      }));
      this.accounts.update((list) => list.map((item) => item.id === saved.id ? saved : item));
      this.notifications.push('success', on ? 'Tenants can now pay by M-Pesa prompt.' : 'M-Pesa prompts are off.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }

  async connect(account: MpesaCollectionAccount): Promise<void> {
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.service.connect(this.agencyId(), account.id));
      this.replace(result);
      this.notifications.push(result.status === 'CONNECTED' ? 'success' : 'error',
        result.status === 'CONNECTED' ? `Connected — payments to ${result.payableNumber} are now recorded automatically.` : 'Not connected — see the reason on the card.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(account: MpesaCollectionAccount): Promise<void> {
    if (!await this.confirm.ask({
      title: `Remove ${account.payableNumber}?`,
      message: this.buildingId()
        ? 'This building goes back to the agency\'s M-Pesa account, or to paying by hand.'
        : 'Payments are no longer recorded automatically; tenants pay by hand and you paste the messages.',
      confirmLabel: 'Remove',
      destructive: true
    })) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.service.remove(this.agencyId(), account.id));
      this.accounts.update((list) => list.filter((item) => item.id !== account.id));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  dateTime(value: string | null | undefined): string {
    return value ? displayDateTime(value) : '';
  }

  private replace(saved: MpesaCollectionAccount): void {
    this.accounts.update((list) => [...list.filter((item) => item.id !== saved.id), saved]);
  }
}
