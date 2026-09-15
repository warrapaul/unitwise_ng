import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { NotificationChannelService } from '../notification-channel.service';
import { ChannelPolicy, ChannelReference, NotificationChannel } from '../models/notification-channel.models';

/**
 * Platform-wide channel policy, one row per message topic.
 *
 * Three sets per topic, and they nest: `allowedChannels` is what the backend
 * permits at all, `enabledChannels` what this platform allows, `defaultChannels`
 * what someone with no preference gets, and `mandatoryChannels` what is sent
 * whatever the recipient chose. Only channels inside `allowedChannels` are
 * offered — the rest are not the admin's to enable.
 */
@Component({
  selector: 'app-notification-policy-page',
  standalone: true,
  imports: [
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent
  ],
  template: `
    <section class="stack">
      <app-section-card
        title="Notification channels"
        subtitle="Which channels each kind of message may use, platform-wide."
      >
        @if (loading()) {
          <app-loading-state label="Loading policies..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (policies().length === 0) {
          <app-empty-state title="No topics yet" description="The backend has registered no message topics." />
        } @else {
          @if (saveError(); as apiError) {
            <app-error-card
              title="Unable to update that policy"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Enabled channels</th>
                  <th>Default</th>
                  <th>Always sent</th>
                  <th>User may choose</th>
                </tr>
              </thead>
              <tbody>
                @for (policy of policies(); track policy.topic) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <strong>{{ topicLabel(policy.topic) }}</strong>
                        <span class="muted">
                          {{ policy.description || (policy.transactional ? 'Transactional' : 'Informational') }}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div class="channels">
                        @for (channel of policy.allowedChannels; track channel) {
                          <label class="checkbox-field">
                            <input
                              type="checkbox"
                              [checked]="policy.enabledChannels.includes(channel)"
                              [disabled]="saving() === policy.topic"
                              (change)="toggleEnabled(policy, channel, $any($event.target).checked)"
                            >
                            <span>{{ channelLabel(channel) }}</span>
                          </label>
                        }
                      </div>
                    </td>
                    <td>{{ labels(policy.defaultChannels) }}</td>
                    <td>{{ labels(policy.mandatoryChannels) }}</td>
                    <td>
                      <app-permission-gate [permissions]="[Permissions.NOTIFICATION_POLICY_WRITE]">
                        <label class="checkbox-field">
                          <input
                            type="checkbox"
                            [checked]="policy.userOverridable === true"
                            [disabled]="saving() === policy.topic"
                            (change)="toggleOverridable(policy, $any($event.target).checked)"
                          >
                          <span>{{ policy.userOverridable ? 'Yes' : 'No' }}</span>
                        </label>
                      </app-permission-gate>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    .channels {
      display: grid;
      gap: 0.2rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationPolicyPageComponent implements OnInit {
  readonly Permissions = PermissionConstants;

  private readonly channels = inject(NotificationChannelService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saveError = signal<ApiError | null>(null);
  readonly saving = signal<string | null>(null);
  readonly policies = signal<ChannelPolicy[]>([]);
  readonly reference = signal<ChannelReference[]>([]);

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [policies, reference] = await Promise.all([
        firstValueFrom(this.channels.getPolicies()),
        firstValueFrom(this.channels.getReference())
      ]);
      this.policies.set(policies);
      this.reference.set(reference.channels);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async toggleEnabled(policy: ChannelPolicy, channel: NotificationChannel, on: boolean): Promise<void> {
    const enabledChannels = on
      ? [...new Set([...policy.enabledChannels, channel])]
      : policy.enabledChannels.filter((current) => current !== channel);

    await this.save(policy, { enabledChannels });
  }

  async toggleOverridable(policy: ChannelPolicy, userOverridable: boolean): Promise<void> {
    await this.save(policy, { userOverridable });
  }

  private async save(policy: ChannelPolicy, patch: Parameters<NotificationChannelService['updatePolicy']>[1]): Promise<void> {
    this.saving.set(policy.topic);
    this.saveError.set(null);

    try {
      const updated = await firstValueFrom(this.channels.updatePolicy(policy.topic, patch));
      this.policies.update((all) => all.map((item) => (item.topic === updated.topic ? updated : item)));
    } catch (error) {
      // The backend refuses to leave a transactional topic with no default
      // channel; that rejection is the message worth showing.
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(null);
    }
  }

  labels(channels: NotificationChannel[]): string {
    return channels.length === 0 ? '—' : channels.map((channel) => this.channelLabel(channel)).join(', ');
  }

  channelLabel(channel: NotificationChannel): string {
    return this.reference().find((item) => item.name === channel)?.displayName ?? channel;
  }

  topicLabel(topic: string): string {
    const words = topic.toLowerCase().split('_').filter(Boolean);
    return words.length === 0 ? topic : words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
  }
}
