import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { HelpContactService } from '../../../shared/services/help-contact.service';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { TenantPreview } from '../models/tenant.models';
import { TenantsService } from '../tenants.service';

/**
 * The signed-in tenant's tenancies, and the one they are looking at. Shared by Home, Rent and
 * Payments, so a tenancy picked on one page is the one the next page opens on.
 */
@Injectable({ providedIn: 'root' })
export class MyTenanciesStore {
  private readonly tenants = inject(TenantsService);
  private readonly session = inject(AuthSessionService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly all = signal<TenantPreview[]>([]);
  private readonly picked = signal<number | null>(null);
  /** Whose tenancies are held: another sign-in on this browser starts again. */
  private loadedFor: number | null = null;

  /** Tenancies with a home behind them; an unanswered invitation shows as the invitation instead. */
  readonly tenancies = computed(() => this.all().filter((tenancy) => tenancy.status !== 'AWAITING_TENANT_ACCEPTANCE'));

  /** The picked one while it is still listed; otherwise the one they live in, else the first. */
  readonly selectedId = computed(() => {
    const list = this.tenancies();
    const picked = this.picked();
    if (picked !== null && list.some((tenancy) => tenancy.id === picked)) {
      return picked;
    }
    return (list.find((tenancy) => tenancy.status === 'ACTIVE') ?? list[0])?.id ?? null;
  });

  readonly selected = computed(() => this.tenancies().find((tenancy) => tenancy.id === this.selectedId()) ?? null);

  /**
   * The month the selected tenancy's bills start: whichever came first of moving in and the
   * tenancy being created, so a bill raised before the move-in date stays reachable.
   */
  readonly since = computed(() => {
    const tenancy = this.selected();
    const dates = [tenancy?.moveInDate, tenancy?.createdAt].filter((date): date is string => !!date).map((date) => date.slice(0, 10));
    return dates.length ? dates.sort()[0] : null;
  });

  private readonly help = inject(HelpContactService);
  private helpFor: number | null = null;

  constructor() {
    // "Request help" on a failed page calls this tenancy's caretaker or landlord.
    effect(() => {
      const id = this.selectedId();
      untracked(() => void this.loadHelpContact(id));
    });
  }

  private async loadHelpContact(id: number | null): Promise<void> {
    if (id === this.helpFor) {
      return;
    }
    this.helpFor = id;
    this.help.contact.set(null);
    if (id === null) {
      return;
    }
    try {
      const contacts = (await firstValueFrom(this.tenants.getMyTenancyOverview(id))).contacts ?? [];
      const pick = contacts.find((c) => c.kind === 'BUILDING' && c.phone) ?? contacts.find((c) => c.kind === 'AGENCY' && c.phone);
      if (pick && this.helpFor === id) {
        this.help.contact.set({ name: pick.name || (pick.kind === 'AGENCY' ? 'the office' : 'your caretaker'), phone: pick.phone!, whatsapp: pick.whatsapp,
          forUser: this.session.userProfile()?.id ?? null });
      }
    } catch {
      // Best effort: without it, errors point to Help & support.
    }
  }

  select(id: number | null): void {
    this.picked.set(id);
  }

  /**
   * Fetches on every visit, so a tenancy accepted elsewhere shows up; the loading state shows only
   * while there is nothing to show yet, so coming back to a page does not flash a spinner.
   */
  async load(): Promise<void> {
    const userId = this.session.userProfile()?.id ?? null;
    if (this.loadedFor !== userId) {
      this.all.set([]);
      this.picked.set(null);
    }
    this.loading.set(this.all().length === 0);
    this.error.set(null);
    try {
      this.all.set(await firstValueFrom(this.tenants.getMyTenantProfiles()));
      this.loadedFor = userId;
    } catch (error) {
      if (this.all().length === 0) {
        this.error.set(extractErrorMessage(error));
      }
    } finally {
      this.loading.set(false);
    }
  }
}
