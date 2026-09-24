import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { assignableRoleNames } from '../../../core/rbac/role.constants';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { MultiSelectComponent } from '../../../shared/components/multi-select/multi-select.component';
import { SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { AccessControlService } from '../../access-control/access-control.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, startWith } from 'rxjs';

@Component({
  selector: 'app-user-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LoadingStateComponent, ErrorStateComponent, ErrorCardComponent, FieldErrorComponent, MultiSelectComponent, FormFeedbackDirective],
  template: `
    <section class="panel form-shell">
      <h1 class="heading-lg">{{ isEditMode ? 'Update user account' : 'Create a new user' }}</h1>

      @if (store.loading()) {
        <app-loading-state label="Loading user..." />
      } @else if (store.error()) {
        <app-error-state [message]="store.error() || 'Unable to load form data'" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <div class="grid-auto">
            <label class="field">
              <span>First name</span>
              <input formControlName="firstName">
              <app-field-error [control]="form.controls.firstName" label="First name" />
            </label>
            <label class="field"><span>Middle name</span><input formControlName="middleName"></label>
            <label class="field">
              <span>Last name</span>
              <input formControlName="lastName">
              <app-field-error [control]="form.controls.lastName" label="Last name" />
            </label>
            <label class="field">
              <span>Email</span>
              <input type="email" formControlName="email">
              <app-field-error [control]="form.controls.email" label="Email" />
            </label>
            <label class="field">
              <span>Phone number</span>
              <input type="tel" formControlName="phoneNumber" placeholder="+254712345678">
              <app-field-error [control]="form.controls.phoneNumber" label="Phone number" patternMessage="9-15 digits, optionally starting with +." />
            </label>
            <label class="field">
              <span>National ID</span>
              <input formControlName="nationalIdNumber">
              <app-field-error [control]="form.controls.nationalIdNumber" label="National ID" />
              <small class="hint">Optional.</small>
            </label>
            <!-- Only the roles this operator may give; the server refuses the rest anyway. -->
            @if (canAssignAny()) {
              <label class="field field--wide">
                <span>Roles</span>
                <app-multi-select
                  formControlName="roleIds"
                  [options]="roleOptions()"
                  searchPlaceholder="Search roles…"
                  emptyMessage="No roles available to assign."
                />
                @if (lockedRoles().length > 0) {
                  <small class="hint">Also holds {{ lockedRoleLabels() }}, which only a super admin can change.</small>
                }
              </label>
            }
          </div>

         
          @if (store.mutationError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This user already exists' : 'Unable to save the user'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          @if (submitBlocked()) {
            <app-error-card
              title="Check the form"
              message="Some fields still need attention. The highlighted ones above are not valid yet."
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="store.mutating()">
              {{ store.mutating() ? 'Saving...' : 'Save user' }}
            </button>
            <a routerLink="/admin/users" class="btn btn-secondary">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    .form-shell {
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserFormPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly accessControl = inject(AccessControlService);

  readonly roles = signal<{ id: number; name: string; description?: string | null }[]>([]);
  private readonly context = inject(ActiveContextService);

  /** Which roles this operator may give — any role they hold counts, not just the active one. */
  private readonly assignable = computed(() =>
    assignableRoleNames(this.context.options().map((option) => option.roleName)));

  private canAssign(roleName: string): boolean {
    const assignable = this.assignable();
    return assignable === 'ALL' || assignable.has(roleName);
  }

  /**
   * Roles set here go through the global user-roles endpoint, which is
   * ROLE_ASSIGN_USER only — a super admin's. An agency admin staffs their
   * agency from its Administrators card instead, so no picker is offered here.
   */
  readonly canAssignAny = computed(() => {
    const assignable = this.assignable();
    return this.context.can('ROLE_ASSIGN_USER') && (assignable === 'ALL' || assignable.size > 0);
  });

  readonly roleOptions = computed<SelectOption<number>[]>(() =>
    this.roles()
      .filter((role) => this.canAssign(role.name))
      .map((role) => ({ value: role.id, label: humanizeLabel(role.name, role.name) }))
  );

  /** On edit: held by the user but not this operator's to change. Sent back as they were. */
  readonly lockedRoles = signal<{ id: number; name: string }[]>([]);
  readonly lockedRoleLabels = computed(() =>
    this.lockedRoles().map((role) => humanizeLabel(role.name, role.name)).join(', '));

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(UsersStore);

  readonly form = this.fb.group({
    firstName: ['', [Validators.required]],
    middleName: [''],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{9,15}$/)]],
    // Optional for an account; when given, the server's 8-13 characters apply.
    nationalIdNumber: ['', [Validators.minLength(8), Validators.maxLength(13)]],
    roleIds: [[] as number[]]
  });

  private readonly submitAttempted = signal(false);

  /** A submit was refused and the form is still invalid. */
  readonly submitBlocked = computed(() => this.submitAttempted() && this.formStatus() !== 'VALID');

  private readonly formStatus = toSignal(
    this.form.statusChanges.pipe(startWith(this.form.status)),
    { initialValue: this.form.status }
  );

  get isEditMode(): boolean {
    return !!this.route.snapshot.paramMap.get('id');
  }

  ngOnInit(): void {
    void this.loadRoles();
    this.load();
  }

  load(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) {
      this.form.reset({
        firstName: '',
        middleName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        nationalIdNumber: '',
        roleIds: []
      });
      return;
    }

    const id = Number(idParam);
    if (Number.isNaN(id)) {
      return;
    }

    void this.store.loadUser(id).then(() => {
      const user = this.store.selectedUser();
      if (!user) {
        return;
      }

      this.form.patchValue({
        firstName: user.firstName,
        middleName: user.middleName ?? '',
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        nationalIdNumber: user.nationalIdNumber ?? '',
        roleIds: (user.roles ?? []).filter((role) => this.canAssign(role.name)).map((role) => role.id)
      });
      this.lockedRoles.set((user.roles ?? []).filter((role) => !this.canAssign(role.name)));
    });
  }


  async submit(): Promise<void> {
    this.submitAttempted.set(true);

    // Refusing to submit is only defensible if the form says why. Before this,
    // an invalid control returned here silently and the button read as dead.
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    // The update replaces the whole set, so roles this operator cannot touch go back unchanged.
    const roleIds = [...new Set([...raw.roleIds, ...this.lockedRoles().map((role) => role.id)])];

    const createPayload = {
      firstName: raw.firstName,
      middleName: raw.middleName || null,
      lastName: raw.lastName,
      email: raw.email,
      phoneNumber: raw.phoneNumber,
      nationalIdNumber: raw.nationalIdNumber.trim() || null,
      roleIds
    };

    if (this.isEditMode) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      const updatePayload = {
        firstName: raw.firstName,
        middleName: raw.middleName || null,
        lastName: raw.lastName,
        email: raw.email,
        phoneNumber: raw.phoneNumber,
        nationalIdNumber: raw.nationalIdNumber.trim() || null
      };

      await this.store.updateUser(id, updatePayload);
      if (!this.store.mutationError()) {
        await this.router.navigateByUrl(RoutePaths.userDetail(id));
      }
      return;
    }

    await this.store.createUser(createPayload);
    if (this.store.mutationError()) {
      return;
    }

    // The store keeps the created record, so the operator lands on the account
    // they just made — where the roles and temp-password actions live (§32).
    const created = this.store.selectedUser();
    await this.router.navigateByUrl(created ? RoutePaths.userDetail(created.id) : RoutePaths.users);
  }

  private async loadRoles(): Promise<void> {
    try {
      this.roles.set(await firstValueFrom(this.accessControl.getRoles()));
    } catch {
      // Without ROLE_READ the list stays empty and the field says so.
      this.roles.set([]);
    }
  }
}
