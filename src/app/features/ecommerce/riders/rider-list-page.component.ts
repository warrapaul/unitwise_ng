import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../ecommerce.service';
import { EcomRider } from '../models/ecommerce.models';

/**
 * The shop's riders: who they are, how to reach them and how their deliveries
 * are going. Deliberately not the user record — identity numbers and the rest
 * of an account are the platform's business, not the shop's.
 *
 * Adding one works two ways: by the UID a person shares from their profile (as
 * a landlord adds a tenant), or by name and phone for someone new — which
 * opens an account they claim with a code.
 */
@Component({
  selector: 'app-rider-list-page',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent,
    PaginationComponent, PermissionGateComponent, SectionCardComponent, FormFeedbackDirective],
  template: `
    <section class="stack">
      <app-section-card title="Riders" subtitle="Who delivers, and how their deliveries are going.">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.ECOM_RIDER_MANAGE]">
            <button type="button" class="btn btn-primary" (click)="openAdd()">Add rider</button>
          </app-permission-gate>
        </ng-container>
        <form class="filters" [formGroup]="filters" (ngSubmit)="search()">
          <label class="field"><span>Name</span><input formControlName="firstName" placeholder="First name"></label>
          <label class="field"><span>Phone</span><input formControlName="phoneNumber" inputmode="tel" placeholder="07..."></label>
          <button type="submit" class="btn btn-secondary">Search</button>
        </form>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading riders..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (riders().length === 0) {
        <app-empty-state title="No riders yet" description="Add a rider by the user UID they share, or by name and phone." />
      } @else {
        <section class="panel table-shell">
          @if (actionError(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Rider</th><th>Phone</th><th class="num">On the road</th><th class="num">Delivered</th><th>Added</th>
                  @if (canManage()) { <th><span class="visually-hidden">Actions</span></th> }
                </tr>
              </thead>
              <tbody>
                @for (rider of riders(); track rider.id) {
                  <tr>
                    <td><strong>{{ name(rider) }}</strong></td>
                    <td>@if (rider.phoneNumber) { <a [href]="'tel:' + rider.phoneNumber">{{ rider.phoneNumber }}</a> } @else { - }</td>
                    <td class="num">{{ rider.activeDeliveries }}</td>
                    <td class="num">{{ rider.deliveredCount }}</td>
                    <td>{{ date(rider.createdAt) }}</td>
                    @if (canManage()) {
                      <td class="actions">
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="removing() === rider.id" (click)="remove(rider)">Remove</button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
        @if (pagination(); as page) {
          <app-pagination [shown]="riders().length" [total]="page.totalElements" noun="riders" [pagination]="page"
                          [size]="page.size" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" (sizeChange)="resize($event)" />
        }
      }
    </section>

    @if (adding()) {
      <app-dialog title="Add a rider" width="34rem" (closed)="adding.set(false)">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" class="tabs__tab" [class.tabs__tab--active]="mode() === 'uid'" (click)="mode.set('uid')">By user UID</button>
          <button type="button" role="tab" class="tabs__tab" [class.tabs__tab--active]="mode() === 'new'" (click)="mode.set('new')">Someone new</button>
        </div>
        @if (mode() === 'uid') {
          <form id="rider-add" class="stack" [formGroup]="uidForm" appFormFeedback (ngSubmit)="add()">
            <label class="field">
              <span>User UID</span>
              <input formControlName="userUid" class="slug" placeholder="e.g. 7KQ2M9XPA" autocomplete="off">
              <small class="hint">They find it on their profile. Their account and other roles stay as they are.</small>
            </label>
          </form>
        } @else {
          <form id="rider-add" class="stack" [formGroup]="newForm" appFormFeedback (ngSubmit)="add()">
            <div class="grid-auto">
              <label class="field"><span>First name</span><input formControlName="firstName"></label>
              <label class="field"><span>Last name</span><input formControlName="lastName"></label>
            </div>
            <label class="field">
              <span>Phone</span>
              <input formControlName="phoneNumber" inputmode="tel" placeholder="07...">
              <small class="hint">A number with an account already just gains the rider role. A new one signs in with a code.</small>
            </label>
          </form>
        }
        @if (addError(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
        <div dialog-actions>
          <button type="submit" form="rider-add" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Adding...' : 'Add rider' }}</button>
          <button type="button" class="btn btn-secondary" (click)="adding.set(false)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2-5); }
    .filters .field { flex: 1 1 12rem; max-width: 18rem; }
    .table-shell { display: grid; gap: var(--space-3); padding: var(--space-4); }
    .table-scroll { overflow: auto; }
    .num { text-align: right; white-space: nowrap; }
    .actions { text-align: right; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RiderListPageComponent implements OnInit {
  readonly Permissions = PermissionConstants;

  private readonly ecommerce = inject(EcommerceService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly confirm = inject(ConfirmService);
  private readonly context = inject(ActiveContextService);

  readonly canManage = computed(() => this.context.can('ECOM_RIDER_MANAGE'));
  readonly riders = signal<EcomRider[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly removing = signal<number | null>(null);
  private page = 0;
  private size = 20;

  readonly filters = this.fb.group({ firstName: '', phoneNumber: '' });

  readonly adding = signal(false);
  readonly mode = signal<'uid' | 'new'>('uid');
  readonly saving = signal(false);
  readonly addError = signal<string | null>(null);
  readonly uidForm = this.fb.group({ userUid: ['', [Validators.required, Validators.maxLength(20)]] });
  readonly newForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9 ]{9,16}$/)]]
  });

  ngOnInit(): void {
    void this.load();
  }

  search(): void {
    this.page = 0;
    void this.load();
  }

  go(page: number): void {
    this.page = Math.max(0, page);
    void this.load();
  }

  resize(size: number): void {
    this.size = size;
    this.page = 0;
    void this.load();
  }

  async load(): Promise<void> {
    const { firstName, phoneNumber } = this.filters.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.ecommerce.getRiders({
        firstName: firstName.trim() || undefined,
        phoneNumber: phoneNumber.replace(/\D/g, '').replace(/^(254|0)/, '') || undefined,
        page: this.page, size: this.size
      }));
      this.riders.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  openAdd(): void {
    this.uidForm.reset({ userUid: '' });
    this.newForm.reset({ firstName: '', lastName: '', phoneNumber: '' });
    this.addError.set(null);
    this.adding.set(true);
  }

  async add(): Promise<void> {
    const form = this.mode() === 'uid' ? this.uidForm : this.newForm;
    if (form.invalid) {
      form.markAllAsTouched();
      this.addError.set(this.mode() === 'uid' ? 'Enter the UID they shared.' : 'Enter a first and last name and a phone number.');
      return;
    }
    this.saving.set(true);
    this.addError.set(null);
    try {
      if (this.mode() === 'uid') {
        await firstValueFrom(this.ecommerce.addRiderByUid(this.uidForm.getRawValue().userUid.trim().toUpperCase()));
      } else {
        const v = this.newForm.getRawValue();
        await firstValueFrom(this.ecommerce.addRider({
          firstName: v.firstName.trim(), lastName: v.lastName.trim(), phoneNumber: v.phoneNumber.replace(/\s+/g, '')
        }));
      }
      this.adding.set(false);
      this.search();
    } catch (error) {
      const apiError = toApiError(error);
      this.addError.set(apiError.status === 404 ? 'No account has that UID. Check it with them.' : apiError.message);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(rider: EcomRider): Promise<void> {
    if (!await this.confirm.ask({
      title: `Stop ${this.name(rider)} being a rider?`,
      message: 'Their account stays; only the rider role is removed. Orders already assigned to them keep their rider until reassigned.',
      confirmLabel: 'Remove rider',
      destructive: true
    })) {
      return;
    }
    this.removing.set(rider.id);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.ecommerce.removeRider(rider.id));
      void this.load();
    } catch (error) {
      this.actionError.set(toApiError(error).message);
    } finally {
      this.removing.set(null);
    }
  }

  name(rider: EcomRider): string {
    return [rider.firstName, rider.lastName].filter(Boolean).join(' ') || rider.phoneNumber || `Rider #${rider.id}`;
  }

  date(value?: string | null): string {
    if (!value) {
      return '-';
    }
    const parsed = new Date(value.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? value : displayDate(parsed);
  }
}
