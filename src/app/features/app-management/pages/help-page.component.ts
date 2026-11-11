import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { formatPhone, whatsappLink } from '../../../shared/utils/format.util';
import { AppManagementService } from '../app-management.service';
import { AppInfo } from '../models/app-management.models';

/** Who to contact about the app itself, as the platform admin set it under App management. */
@Component({
  selector: 'app-help-page',
  standalone: true,
  imports: [LoadingStateComponent, ErrorStateComponent, SectionCardComponent],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="load()" />
    } @else if (info(); as i) {
      <app-section-card title="Contact Unitwise" [subtitle]="i.supportHours || null">
        @if (i.helpText) { <p class="text">{{ i.helpText }}</p> }
        <p class="muted">For your rent, home or repairs, contact your landlord — this is for problems with the app.</p>
        @if (i.supportPhone || i.supportWhatsapp || i.supportEmail) {
          <div class="ways">
            @if (i.supportPhone) { <a class="btn btn-primary" [href]="'tel:' + i.supportPhone">Call {{ phone(i.supportPhone) }}</a> }
            @if (i.supportWhatsapp && whatsapp(i.supportWhatsapp); as link) { <a class="btn btn-secondary" [href]="link" target="_blank" rel="noopener">WhatsApp</a> }
            @if (i.supportEmail) { <a class="btn btn-secondary" [href]="'mailto:' + i.supportEmail">Email {{ i.supportEmail }}</a> }
          </div>
        } @else {
          <p class="muted">Support contacts have not been set up yet.</p>
        }
        @if (i.appVersion) { <p class="muted small">Version {{ i.appVersion }}</p> }
      </app-section-card>
    }
  `,
  styles: [`
    .text { margin: 0; white-space: pre-line; }
    .muted { margin: 0; }
    .ways { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .small { font-size: var(--text-sm); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpPageComponent implements OnInit {
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

  phone(value: string): string {
    return formatPhone(value);
  }

  whatsapp(value: string): string | null {
    return whatsappLink(value);
  }
}
