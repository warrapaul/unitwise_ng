import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { displayDate } from '../../../shared/utils/display-date.util';
import { AppManagementService } from '../../app-management/app-management.service';
import { AppInfo } from '../../app-management/models/app-management.models';

/**
 * The terms and the privacy policy for someone not signed in — linked from the landing page and
 * sign-up. The same text the platform admin publishes under App management.
 */
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [LoadingStateComponent, RouterLink],
  template: `
    <div class="legal">
      <a class="brand" [routerLink]="RoutePaths.splash">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>
        </span>
        <span>Unitwise</span>
      </a>
      <main>
        <h1>{{ title() }}</h1>
        @if (loading()) {
          <app-loading-state [compact]="true" label="Loading…" />
        } @else if (text(); as body) {
          @if (updated(); as on) { <p class="muted">Updated {{ on }}</p> }
          <div class="body">{{ body }}</div>
          @if (doc() === 'privacy' && info()?.dataProtectionRegistration; as dpa) {
            <p class="muted">We process personal data under Kenya's Data Protection Act, 2019, and are registered with the Office of the Data Protection Commissioner ({{ dpa }}).</p>
          }
        } @else {
          <p class="muted">Not published yet. Questions? {{ contact() }}</p>
        }
        <p><a [routerLink]="RoutePaths.splash">← Back to the home page</a></p>
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--surface); }
    .legal { max-width: 46rem; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-8); }
    .brand { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--text); font-weight: var(--weight-bold); text-decoration: none; }
    .brand__mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: var(--radius-sm); background: var(--primary); color: var(--on-accent); }
    h1 { margin: var(--space-6) 0 var(--space-2); }
    .body { white-space: pre-line; line-height: 1.7; font-size: var(--text-base); }
    .muted { color: var(--text-muted); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LegalPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  /** From route data: which document. */
  readonly doc = input<'terms' | 'privacy'>('privacy');
  private readonly service = inject(AppManagementService);
  readonly info = signal<AppInfo | null>(null);
  readonly loading = signal(true);

  readonly title = computed(() => this.doc() === 'terms' ? 'Terms of service' : 'Privacy policy');
  readonly text = computed(() => this.doc() === 'terms' ? this.info()?.termsOfService : this.info()?.privacyPolicy);
  readonly updated = computed(() => {
    const on = this.doc() === 'terms' ? this.info()?.termsUpdatedOn : this.info()?.privacyUpdatedOn;
    return on ? displayDate(on) : null;
  });
  readonly contact = computed(() => this.info()?.supportEmail ?? this.info()?.supportPhone ?? '');

  ngOnInit(): void {
    firstValueFrom(this.service.getAppInfo()).then((info) => this.info.set(info)).catch(() => undefined)
      .finally(() => this.loading.set(false));
  }
}
