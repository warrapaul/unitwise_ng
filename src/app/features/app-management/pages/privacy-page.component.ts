import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { displayDate } from '../../../shared/utils/display-date.util';
import { AppManagementService } from '../app-management.service';
import { AppInfo } from '../models/app-management.models';

/** The privacy policy, as the platform admin published it under App management. Plain text, paragraphs kept. */
@Component({
  selector: 'app-privacy-page',
  standalone: true,
  imports: [LoadingStateComponent, ErrorStateComponent, SectionCardComponent],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading…" />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="load()" />
    } @else if (info(); as i) {
      <app-section-card title="Privacy policy" [subtitle]="i.privacyUpdatedOn ? 'Updated ' + date(i.privacyUpdatedOn) : null">
        @if (i.privacyPolicy) {
          <div class="policy">{{ i.privacyPolicy }}</div>
        } @else {
          <p class="muted">The privacy policy has not been published yet.</p>
        }
      </app-section-card>
    }
  `,
  styles: [`
    .policy { white-space: pre-line; max-width: 46rem; line-height: 1.6; }
    .muted { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrivacyPageComponent implements OnInit {
  private readonly service = inject(AppManagementService);
  readonly info = signal<AppInfo | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.info.set(await firstValueFrom(this.service.getAppInfo()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  date(value: string): string {
    return displayDate(value);
  }
}
