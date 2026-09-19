import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { CatalogAdminService } from '../catalog-admin.service';
import { CustomerGroup, CustomerGroupMember } from '../models/catalog.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-customer-group-detail-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.customerGroups" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading group..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (group(); as detail) {
        <app-section-card [title]="detail.name" [subtitle]="detail.description || null">
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.CUSTOMER_GROUP_UPDATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.customerGroupEdit(detail.id)">Edit</a>
              </app-permission-gate>
            </div>
          </ng-container>

          <dl class="detail-grid">
            <div><dt>Members</dt><dd>{{ detail.memberCount ?? 0 }}</dd></div>
            <div>
              <dt>Default discount</dt>
              <dd>{{ detail.discountPercentage !== null && detail.discountPercentage !== undefined ? detail.discountPercentage + '%' : '-' }}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <app-status-chip [status]="detail.isActive ? 'ACTIVE' : 'INACTIVE'" />
              </dd>
            </div>
            <div><dt>Created</dt><dd>{{ formatDate(detail.createdAt) }}</dd></div>
          </dl>
        </app-section-card>

        <app-permission-gate [permissions]="[Permissions.CUSTOMER_GROUP_MEMBER_ADD]">
          <app-section-card title="Add member">
            <form [formGroup]="memberForm" appFormFeedback (ngSubmit)="addMember()">
              <div class="grid-auto">
                <label class="field">
                  <span>User ID</span>
                  <input type="number" formControlName="userId" placeholder="1024">
                  @if (memberForm.controls.userId.invalid && memberForm.controls.userId.touched) {
                    <small class="error-text">A user ID is required.</small>
                  }
                </label>
                <label class="field">
                  <span>Expires at</span>
                  <input type="datetime-local" formControlName="expiresAt">
                  <small class="hint">Leave empty for permanent membership.</small>
                </label>
                <label class="field">
                  <span>Notes</span>
                  <input formControlName="notes">
                </label>
              </div>

              @if (memberError(); as apiError) {
                <app-error-card
                  [title]="apiError.status === 409 ? 'Already a member' : 'Unable to add member'"
                  [message]="apiError.message"
                  [details]="apiError.details"
                />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="addingMember()">
                  {{ addingMember() ? 'Adding...' : 'Add member' }}
                </button>
              </div>
            </form>
          </app-section-card>
        </app-permission-gate>

        <app-section-card title="Members">
          @if (membersLoading()) {
            <app-loading-state label="Loading members..." />
          } @else if (membersError()) {
            <app-error-state [message]="membersError()!" (retry)="loadMembers()" />
          } @else if (members().length === 0) {
            <app-empty-state title="No members yet" description="Add a customer to apply this group's pricing." />
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Member</th><th>Contact</th><th>Expires</th><th>Status</th><th class="actions-col">Actions</th></tr>
                </thead>
                <tbody>
                  @for (member of members(); track member.id) {
                    <tr>
                      <td>
                        <div class="cell-stack">
                          <span>{{ member.userFullName || ('User #' + member.userId) }}</span>
                          <span class="muted">{{ member.notes || '-' }}</span>
                        </div>
                      </td>
                      <td>
                        <div class="cell-stack">
                          <span>{{ member.userEmail || '-' }}</span>
                          <span class="muted">{{ member.userPhone || '-' }}</span>
                        </div>
                      </td>
                      <td>{{ formatDate(member.expiresAt) }}</td>
                      <td>
                        <span class="status-chip" [ngClass]="member.isActive ? 'status-chip--success' : 'status-chip--neutral'">
                          {{ member.isActive ? 'Active' : 'Expired' }}
                        </span>
                      </td>
                      <td class="actions-col">
                        <app-permission-gate [permissions]="[Permissions.CUSTOMER_GROUP_MEMBER_REMOVE]">
                          <button
                            type="button"
                            class="btn btn-danger btn-sm"
                            [disabled]="removingUserId() === member.userId"
                            (click)="removeMember(member)"
                          >
                            {{ removingUserId() === member.userId ? 'Removing...' : 'Remove' }}
                          </button>
                        </app-permission-gate>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (membersPagination()) {
              <app-pagination
                [pagination]="membersPagination()!"
                [size]="membersPagination()!.size"
                (previous)="previousMembersPage()"
                (next)="nextMembersPage()"
                (sizeChange)="changeMembersPageSize($event)"
              />
            }
          }
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .actions-col {
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerGroupDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly catalogAdmin = inject(CatalogAdminService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly group = signal<CustomerGroup | null>(null);

  readonly membersLoading = signal(false);
  readonly membersError = signal<string | null>(null);
  readonly members = signal<CustomerGroupMember[]>([]);
  readonly membersPagination = signal<Pagination | null>(null);
  readonly membersPage = signal(0);
  readonly membersSize = signal(20);

  readonly addingMember = signal(false);
  readonly memberError = signal<ApiError | null>(null);
  readonly removingUserId = signal<number | null>(null);

  readonly memberForm = this.formBuilder.group({
    userId: [null as number | null, [Validators.required, Validators.min(1)]],
    expiresAt: '',
    notes: ''
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
    void this.loadMembers();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.group.set(await firstValueFrom(this.catalogAdmin.getCustomerGroup(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async loadMembers(): Promise<void> {
    this.membersLoading.set(true);
    this.membersError.set(null);

    try {
      const result = await firstValueFrom(this.catalogAdmin.getCustomerGroupMembers(Number(this.id()), {
        page: this.membersPage(),
        size: this.membersSize()
      }));
      this.members.set(result.items);
      this.membersPagination.set(result.pagination);
    } catch (error) {
      this.membersError.set(extractErrorMessage(error));
    } finally {
      this.membersLoading.set(false);
    }
  }

  async addMember(): Promise<void> {
    if (this.memberForm.invalid) {
      this.memberForm.markAllAsTouched();
      return;
    }

    this.addingMember.set(true);
    this.memberError.set(null);

    const value = this.memberForm.getRawValue();

    try {
      await firstValueFrom(this.catalogAdmin.addCustomerGroupMember(Number(this.id()), {
        userId: value.userId!,
        notes: value.notes || null,
        expiresAt: value.expiresAt || null
      }));
      this.memberForm.reset({ userId: null, expiresAt: '', notes: '' });
      await this.loadMembers();
      await this.reload();
    } catch (error) {
      this.memberError.set(toApiError(error));
    } finally {
      this.addingMember.set(false);
    }
  }

  async removeMember(member: CustomerGroupMember): Promise<void> {
    if (!await this.confirm.ask({
      title: `Remove ${member.userFullName || 'user #' + member.userId} from this group?`,
      confirmLabel: 'Remove',
      destructive: true
    })) {
      return;
    }

    this.removingUserId.set(member.userId);
    this.membersError.set(null);

    try {
      await firstValueFrom(this.catalogAdmin.removeCustomerGroupMember(Number(this.id()), member.userId));
      this.members.update((items) => items.filter((item) => item.userId !== member.userId));
      await this.reload();
    } catch (error) {
      this.membersError.set(extractErrorMessage(error));
    } finally {
      this.removingUserId.set(null);
    }
  }

  async previousMembersPage(): Promise<void> {
    if (this.membersPage() <= 0) {
      return;
    }

    this.membersPage.update((value) => value - 1);
    await this.loadMembers();
  }

  async nextMembersPage(): Promise<void> {
    const pagination = this.membersPagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.membersPage.set(pagination.page + 1);
    await this.loadMembers();
  }

  async changeMembersPageSize(size: number): Promise<void> {
    this.membersSize.set(size);
    this.membersPage.set(0);
    await this.loadMembers();
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }
}
