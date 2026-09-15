import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { NotificationChannelService } from '../notification-channel.service';
import { ChannelPreference, ChannelReference, NotificationChannel } from '../models/notification-channel.models';

/**
 * How the signed-in user receives each kind of message — moving OTP to WhatsApp,
 * silencing marketing, and so on.
 *
 * Only `selectableChannels` are offered: the platform policy decides the outer
 * bound, and a channel it has disabled for a topic is not the user's to pick.
 * `mandatoryChannels` are shown but not togglable, because they are sent
 * whatever the user chooses.
 */
@Component({
  selector: 'app-notification-preferences-page',
  standalone: true,
  imports: [LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent, ErrorCardComponent],
  template: `
    <section class="stack">
      <app-section-card
        title="Notifications"
      >
        @if (loading()) {
          <app-loading-state label="Loading your preferences..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (preferences().length === 0) {
          <app-empty-state title="Nothing to configure" description="No message topics are available yet." />
        } @else {
          @if (saveError(); as apiError) {
            <app-error-card
              title="Unable to save that preference"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="topics">
            @for (preference of preferences(); track preference.topic) {
              <article class="topic">
                <header class="topic__head">
                  <div>
                    <strong>{{ topicLabel(preference.topic) }}</strong>
                    @if (preference.topicDescription) {
                      <p class="muted">{{ preference.topicDescription }}</p>
                    }
                  </div>
                  @if (preference.editable === false) {
                    <span class="status-chip status-chip--neutral">Set by your administrator</span>
                  }
                </header>

                <div class="channels">
                  @for (channel of preference.selectableChannels; track channel) {
                    <label class="checkbox-field">
                      <input
                        type="checkbox"
                        [checked]="preference.effectiveChannels.includes(channel)"
                        [disabled]="preference.editable === false || saving() === preference.topic"
                        (change)="toggle(preference, channel, $any($event.target).checked)"
                      >
                      <span>{{ channelLabel(channel) }}</span>
                    </label>
                  }

                  @for (channel of preference.mandatoryChannels; track channel) {
                    <span class="status-chip status-chip--info" [title]="'Always sent for this topic'">
                      {{ channelLabel(channel) }} · always
                    </span>
                  }
                </div>

                @if (preference.selectableChannels.length === 0) {
                  <p class="muted">This message is always sent the same way and cannot be changed.</p>
                }
              </article>
            }
          </div>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    .topics {
      display: grid;
      gap: 0.6rem;
    }

    .topic {
      display: grid;
      gap: 0.5rem;
      padding: 0.75rem 0.85rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
    }

    .topic__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .topic__head p {
      margin: 0.15rem 0 0;
      font-size: 0.85rem;
    }

    .channels {
      display: flex;
      align-items: center;
      gap: 0.5rem 1rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationPreferencesPageComponent implements OnInit {
  private readonly channels = inject(NotificationChannelService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saveError = signal<ApiError | null>(null);
  readonly saving = signal<string | null>(null);
  readonly preferences = signal<ChannelPreference[]>([]);
  readonly reference = signal<ChannelReference[]>([]);

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [preferences, reference] = await Promise.all([
        firstValueFrom(this.channels.getMyPreferences()),
        firstValueFrom(this.channels.getReference())
      ]);
      this.preferences.set(preferences);
      this.reference.set(reference.channels);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async toggle(preference: ChannelPreference, channel: NotificationChannel, on: boolean): Promise<void> {
    // Send the full desired set: the endpoint replaces rather than patches, and
    // an empty set with muted=false is what resets a topic to its default.
    const next = on
      ? [...new Set([...preference.effectiveChannels, channel])]
      : preference.effectiveChannels.filter((current) => current !== channel);

    this.saving.set(preference.topic);
    this.saveError.set(null);

    try {
      const updated = await firstValueFrom(
        this.channels.updateMyPreference(preference.topic, { channels: next, muted: false })
      );
      this.preferences.update((all) => all.map((item) => (item.topic === updated.topic ? updated : item)));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(null);
    }
  }

  channelLabel(channel: NotificationChannel): string {
    return this.reference().find((item) => item.name === channel)?.displayName ?? channel;
  }

  /** `RENT_REMINDER` -> `Rent reminder`. */
  topicLabel(topic: string): string {
    const words = topic.toLowerCase().split('_').filter(Boolean);
    return words.length === 0 ? topic : words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
  }
}
