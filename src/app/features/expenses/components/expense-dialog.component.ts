import { todayIso } from '../../../shared/utils/date.util';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FileUploadComponent } from '../../../shared/components/files/file-upload/file-upload.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../../housing/housing.service';
import { BuildingPreview } from '../../housing/models/housing.models';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_RECEIPT_MAX_MB,
  EXPENSE_RECEIPT_TYPES,
  Expense,
  ExpenseCategory,
  ExpensePaidBy,
  ExpensePaymentMethod
} from '../expenses.models';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ExpensesService } from '../expenses.service';


/**
 * Records or corrects an expense. The building comes from where it was opened (the context, or the
 * repair); only an agency-wide view asks which. The receipt goes up right after the save.
 */
@Component({
  selector: 'app-expense-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FileUploadComponent, RoomPickerComponent,
    DateDisplayDirective, FormFeedbackDirective, MoneyInputDirective],
  template: `
    <app-dialog [title]="expense() ? 'Edit expense' : 'Record an expense'" [subtitle]="subtitle()" width="40rem" (closed)="closed.emit()">
      <form id="expense-form" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <div class="pairs">
          @if (!buildingId() && !expense()) {
            <label class="field">
              <span>Building</span>
              <select formControlName="buildingId">
                <option [ngValue]="null" disabled>Choose a building</option>
                @for (building of buildings(); track building.id) {
                  <option [value]="building.id">{{ building.name }}</option>
                }
              </select>
              <app-field-error [control]="form.controls.buildingId" label="Building" />
            </label>
          }
          <label class="field">
            <span>Category</span>
            <select formControlName="category">
              @for (option of categories; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Amount</span>
            <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span>
              <input appMoneyInput formControlName="amount" aria-label="Amount in KES"></span>
            <app-field-error [control]="form.controls.amount" label="Amount" />
          </label>
          <label class="field">
            <span>Date paid</span>
            <input type="date" appDateDisplay formControlName="expenseDate" [max]="maxDate">
            <app-field-error [control]="form.controls.expenseDate" label="Date paid" />
          </label>
        </div>

        <label class="field">
          <span>What was it for</span>
          <input formControlName="description" maxlength="255">
          <app-field-error [control]="form.controls.description" label="What was it for" />
        </label>

        <div class="pairs">
          <label class="field">
            <span>Paid to <span class="muted">(optional)</span></span>
            <input formControlName="payee" maxlength="150">
          </label>
          @if (chosenBuilding(); as building) {
            <label class="field">
              <span>Room <span class="muted">(optional)</span></span>
              <app-room-picker formControlName="roomId" [agencyId]="agencyId()" [buildingId]="building" [clearable]="true" placeholder="The whole building" />
            </label>
          }
          @if (forOwners()) {
            <label class="field">
              <span>Whose money</span>
              <select formControlName="paidBy">
                <option value="AGENCY">From rent we hold</option>
                <option value="OWNER">The owner's, paid directly</option>
              </select>
              <small class="hint">{{ form.controls.paidBy.value === 'OWNER' ? 'Shown on their statement, not deducted.' : 'Deducted on the owner\'s statement.' }}</small>
            </label>
          }
          <label class="field">
            <span>Paid with <span class="muted">(optional)</span></span>
            <select formControlName="paymentMethod">
              <option value="">Not recorded</option>
              @for (option of methods; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Reference <span class="muted">(optional)</span></span>
            <input formControlName="reference" maxlength="100" class="uppercase">
          </label>
        </div>

        <label class="field">
          <span>Notes <span class="muted">(optional)</span></span>
          <textarea formControlName="notes" rows="2" maxlength="500"></textarea>
        </label>

        <app-file-upload [label]="expense()?.receiptName ? 'Replace the receipt' : 'Receipt (optional)'" [types]="receiptTypes" [maxSizeMb]="receiptMaxMb"
                         hint="A photo or PDF, up to 10 MB." (fileChange)="receipt.set($event)" />
        @if (expense()?.receiptUrl; as url) {
          <a class="text-link" [href]="url" target="_blank" rel="noopener">See the current receipt</a>
        }

        @if (error(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="expense-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : expense() ? 'Save' : 'Record expense' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  /** Where it was opened from; null on the agency-wide list, which then asks. */
  readonly buildingId = input<number | null>(null);
  readonly expense = input<Expense | null>(null);
  /** Opened from a repair: the expense is tied to it, and the room comes with it. */
  readonly maintenanceRequestId = input<number | null>(null);
  readonly roomId = input<number | null>(null);
  readonly subtitle = input<string | null>(null);

  readonly saved = output<Expense>();
  readonly closed = output<void>();

  private readonly expenses = inject(ExpensesService);
  private readonly housing = inject(HousingService);
  private readonly fb = inject(NonNullableFormBuilder);
  /** Who paid only matters to an agency that manages buildings for owners. */
  readonly forOwners = inject(ActiveContextService).managesForOwners;

  readonly categories = EXPENSE_CATEGORIES;
  readonly methods = EXPENSE_PAYMENT_METHODS;
  readonly receiptTypes = EXPENSE_RECEIPT_TYPES;
  readonly receiptMaxMb = EXPENSE_RECEIPT_MAX_MB;
  readonly maxDate = todayIso();

  readonly buildings = signal<BuildingPreview[]>([]);
  readonly receipt = signal<File | null>(null);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    buildingId: [null as number | null],
    category: ['REPAIRS' as ExpenseCategory, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    expenseDate: [todayIso(), Validators.required],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    payee: '',
    roomId: [null as number | null],
    paymentMethod: '' as ExpensePaymentMethod | '',
    paidBy: 'AGENCY' as ExpensePaidBy,
    reference: '',
    notes: ''
  });

  chosenBuilding(): number | null {
    return this.expense()?.buildingId ?? this.buildingId() ?? (this.form.controls.buildingId.value ? Number(this.form.controls.buildingId.value) : null);
  }

  ngOnInit(): void {
    const existing = this.expense();
    if (existing) {
      this.form.patchValue({
        category: existing.category, amount: Number(existing.amount), expenseDate: existing.expenseDate,
        description: existing.description, payee: existing.payee ?? '', roomId: existing.roomId ?? null,
        paymentMethod: existing.paymentMethod ?? '', paidBy: existing.paidBy ?? 'AGENCY', reference: existing.reference ?? '', notes: existing.notes ?? ''
      });
    } else {
      this.form.patchValue({ roomId: this.roomId() });
      if (!this.buildingId()) {
        this.form.controls.buildingId.addValidators(Validators.required);
        firstValueFrom(this.housing.getBuildingsForAgency(this.agencyId(), { page: 0, size: 100 }))
          .then((page) => this.buildings.set(page.items)).catch(() => this.buildings.set([]));
      }
    }
  }

  async save(): Promise<void> {
    const buildingId = this.chosenBuilding();
    if (this.form.invalid || !buildingId) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const request = {
      roomId: v.roomId,
      maintenanceRequestId: this.expense()?.maintenanceRequestId ?? this.maintenanceRequestId(),
      category: v.category,
      description: v.description.trim(),
      payee: v.payee.trim() || null,
      amount: Number(v.amount),
      expenseDate: v.expenseDate,
      paymentMethod: v.paymentMethod || null,
      paidBy: v.paidBy,
      reference: v.reference.trim() || null,
      notes: v.notes.trim() || null
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      const existing = this.expense();
      let result = existing
        ? await firstValueFrom(this.expenses.update(this.agencyId(), existing.buildingId, existing.id, request))
        : await firstValueFrom(this.expenses.create(this.agencyId(), buildingId, request));
      const file = this.receipt();
      if (file) {
        result = await firstValueFrom(this.expenses.attachReceipt(this.agencyId(), result.buildingId, result.id, file));
      }
      this.saved.emit(result);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
