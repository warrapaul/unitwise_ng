import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';

@Component({
  selector: 'app-user-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LoadingStateComponent, ErrorStateComponent],
  template: `
    <section class="panel form-shell">
      <div class="stack">
        <span class="pill">{{ isEditMode ? 'Edit user' : 'Create user' }}</span>
        <h1 class="heading-lg">{{ isEditMode ? 'Update user account' : 'Create a new user' }}</h1>
        <p class="muted">The form maps directly to the backend DTOs for both admin creation and user updates.</p>
      </div>

      @if (store.loading()) {
        <app-loading-state label="Loading user..." />
      } @else if (store.error()) {
        <app-error-state [message]="store.error() || 'Unable to load form data'" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
          <div class="grid-auto">
            <label class="field"><span>First name</span><input formControlName="firstName"></label>
            <label class="field"><span>Middle name</span><input formControlName="middleName"></label>
            <label class="field"><span>Last name</span><input formControlName="lastName"></label>
            <label class="field"><span>Email</span><input type="email" formControlName="email"></label>
            <label class="field"><span>Phone number</span><input type="tel" formControlName="phoneNumber"></label>
            <label class="field"><span>National ID</span><input formControlName="nationalIdNumber"></label>
            <label class="field"><span>Password</span><input type="password" formControlName="password"></label>
            <label class="field"><span>Role IDs (comma separated)</span><input formControlName="roleIds"></label>
          </div>

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="store.mutating()">
              {{ store.mutating() ? 'Saving...' : 'Save user' }}
            </button>
            <a routerLink="/users" class="btn btn-secondary">Cancel</a>
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(UsersStore);

  readonly form = this.fb.group({
    firstName: ['', [Validators.required]],
    middleName: [''],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\\+?[0-9]{9,15}$/)]],
    nationalIdNumber: ['', [Validators.required, Validators.minLength(8)]],
    password: [''],
    roleIds: ['']
  });

  get isEditMode(): boolean {
    return !!this.route.snapshot.paramMap.get('id');
  }

  ngOnInit(): void {
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
        password: '',
        roleIds: ''
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
        nationalIdNumber: user.nationalIdNumber,
        roleIds: user.roles?.map((role) => role.id).join(', ') ?? ''
      });
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const roleIds = raw.roleIds
      ? raw.roleIds.split(',').map((value) => Number(value.trim())).filter((value) => !Number.isNaN(value))
      : undefined;

    const createPayload = {
      firstName: raw.firstName,
      middleName: raw.middleName || null,
      lastName: raw.lastName,
      email: raw.email,
      phoneNumber: raw.phoneNumber,
      nationalIdNumber: raw.nationalIdNumber,
      password: raw.password || null,
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
        nationalIdNumber: raw.nationalIdNumber,
        password: raw.password || undefined
      };

      await this.store.updateUser(id, updatePayload);
      if (!this.store.error()) {
        await this.router.navigateByUrl('/users');
      }
      return;
    }

    await this.store.createUser(createPayload);
    if (!this.store.error()) {
      await this.router.navigateByUrl('/users');
    }
  }
}
