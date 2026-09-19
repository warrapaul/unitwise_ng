import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { NotificationPreferencesPageComponent } from '../../notifications/pages/notification-preferences-page.component';
import { ThemePreference, ThemeService } from '../../../core/services/theme.service';

/**
 * The signed-in person's own settings.
 *
 * One destination rather than a nav entry per preference. "Notification
 * settings" sat alone in the sidebar, which made the next preference an
 * awkward question — a second top-level entry, or a group of two? Settings
 * is the answer both times.
 *
 * Distinct from Settings under System, which is the app's own maintenance
 * (cache eviction, version pinning) and is permission-gated. This one is
 * about the person and needs no permission at all.
 */
@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [SectionCardComponent, NotificationPreferencesPageComponent],
  template: `
    <section class="stack">
      <app-section-card
        title="Appearance"
        subtitle="Applies to this browser only — the same account can look different on your phone."
      >
        <!--
          Three options, not a switch. "System" is a real answer rather than
          the absence of one: a phone that dims at sunset should take this
          with it, and a two-way toggle forces a choice nobody asked to make.
        -->
        <div class="themes" role="radiogroup" aria-label="Theme">
          @for (option of options; track option.value) {
            <button
              type="button"
              role="radio"
              class="theme"
              [class.theme--on]="theme.preference() === option.value"
              [attr.aria-checked]="theme.preference() === option.value"
              (click)="theme.set(option.value)"
            >
              <span class="theme__swatch" [attr.data-preview]="option.value" aria-hidden="true"></span>
              <span class="theme__label">{{ option.label }}</span>
              <span class="muted theme__hint">{{ option.hint }}</span>
            </button>
          }
        </div>
      </app-section-card>

      <app-notification-preferences-page />
    </section>
  `,
  styles: [`
    .themes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 14rem));
      gap: 0.75rem;
    }

    .theme {
      display: grid;
      gap: 0.25rem;
      justify-items: start;
      padding: 0.85rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .theme--on { border-color: var(--primary); background: var(--primary-tint); }

    .theme__swatch {
      width: 100%;
      height: 2.2rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong);
    }

    /* Literal previews rather than the live tokens, so each one shows what
       it would look like instead of what is on screen now. */
    .theme__swatch[data-preview='light'] { background: linear-gradient(135deg, #eef0ec 60%, #ffffff); }
    .theme__swatch[data-preview='dark'] { background: linear-gradient(135deg, #16191a 60%, #1e2322); }
    .theme__swatch[data-preview='system'] { background: linear-gradient(135deg, #eef0ec 50%, #16191a 50%); }

    .theme__label { font-weight: 700; }
    .theme__hint { font-size: 0.8rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPageComponent {
  readonly theme = inject(ThemeService);

  readonly options: readonly { value: ThemePreference; label: string; hint: string }[] = [
    { value: 'system', label: 'Match my device', hint: 'Follows your system setting' },
    { value: 'light', label: 'Light', hint: 'Always the light palette' },
    { value: 'dark', label: 'Dark', hint: 'Always the dark palette' }
  ];
}
