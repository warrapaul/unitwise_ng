import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { HelpContactService } from '../../services/help-contact.service';
import { formatPhone, whatsappLink } from '../../utils/format.util';

/**
 * A failed load: what went wrong, Retry, and a way to ask a person when retrying does not help —
 * the tenant's caretaker or landlord when known, otherwise Help & support.
 */
@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="alert alert-error" role="alert">
      <strong>{{ title() }}</strong>
      <p>{{ message() }}</p>
      @if (retryLabel()) {
        <button type="button" class="btn btn-secondary retry" (click)="retry.emit()">{{ retryLabel() }}</button>
      }
      @if (help()) {
        <p class="help">Still not working?
          @if (contact(); as c) {
            <a class="text-link" [href]="'tel:' + c.phone">Call {{ c.name }} on {{ phone(c.phone) }}</a>@if (whatsapp(); as link) { or
              <a class="text-link" [href]="link" target="_blank" rel="noopener">WhatsApp them</a>}.
          } @else {
            <a class="text-link" [routerLink]="RoutePaths.help">Request help</a>.
          }
        </p>
      }
    </section>
  `,
  styles: [`
    p {
      margin: var(--space-1-5) 0 0;
      color: var(--danger);
    }
    .retry { margin-top: var(--space-2); }
    .help { margin-top: var(--space-2); color: var(--text-muted); font-size: var(--text-sm); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorStateComponent {
  readonly RoutePaths = RoutePaths;
  readonly title = input('Something went wrong');
  readonly message = input('Please try again.');
  readonly retryLabel = input<string | null>('Retry');
  /** Off where help makes no sense, such as inside a dialog the user can simply close. */
  readonly help = input(true);
  readonly retry = output<void>();

  private readonly found = inject(HelpContactService).contact;
  private readonly session = inject(AuthSessionService);
  readonly contact = computed(() => {
    const c = this.found();
    return c && c.forUser === (this.session.userProfile()?.id ?? null) ? c : null;
  });
  readonly whatsapp = computed(() => whatsappLink(this.contact()?.whatsapp));

  phone(value: string): string {
    return formatPhone(value);
  }
}
