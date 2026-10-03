import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { firstValueFrom } from 'rxjs';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
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
/** One cell of the policy table: how a channel carries one kind of message. */
type ChannelMode = 'OFF' | 'OPTIONAL' | 'DEFAULT' | 'ALWAYS';

@Component({
  selector: 'app-notification-policy-page',
  standalone: true,
  imports: [
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent
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

          <!--
            One row per kind of message, one column per channel, one decision per
            cell. The four modes nest the backend's three sets (always ⊂ default ⊂
            enabled), so a cell can never express an impossible combination.
          -->
          <div class="table-scroll">
            <table class="table policy-table">
              <thead>
                <tr>
                  <th>Notification</th>
                  @for (channel of channelColumns(); track channel) {
                    <th>{{ channelLabel(channel) }}</th>
                  }
                  <th>Recipient may change</th>
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
                    @for (channel of channelColumns(); track channel) {
                      <td>
                        @if (policy.allowedChannels.includes(channel)) {
                          <select class="mode" [value]="modeOf(policy, channel)" [attr.aria-label]="topicLabel(policy.topic) + ' by ' + channelLabel(channel)"
                                  [disabled]="!canWrite() || saving() === policy.topic"
                                  (change)="setMode(policy, channel, $any($event.target).value)">
                            @for (mode of modes; track mode.value) {
                              <option [value]="mode.value">{{ mode.label }}</option>
                            }
                          </select>
                        } @else {
                          <span class="muted" title="This channel cannot carry this notification">—</span>
                        }
                      </td>
                    }
                    <td>
                      <label class="checkbox-field">
                        <input type="checkbox" [checked]="policy.userOverridable === true"
                               [disabled]="!canWrite() || saving() === policy.topic"
                               (change)="toggleOverridable(policy, $any($event.target).checked)">
                        <span>{{ policy.userOverridable ? 'Yes' : 'No' }}</span>
                      </label>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <dl class="legend">
            @for (mode of modes; track mode.value) {
              <div><dt>{{ mode.label }}</dt><dd>{{ mode.hint }}</dd></div>
            }
          </dl>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    .policy-table .mode { min-height: var(--control-sm); padding: 0.2rem 0.4rem; font-size: 0.85rem; }
    .legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.4rem 1rem; margin: 0; font-size: 0.82rem; }
    .legend dt { font-weight: 700; }
    .legend dd { margin: 0; color: var(--text-muted); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationPolicyPageComponent implements OnInit {
  readonly Permissions = PermissionConstants;
  private readonly context = inject(ActiveContextService);

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

  readonly modes: readonly { value: ChannelMode; label: string; hint: string }[] = [
    { value: 'OFF', label: 'Off', hint: 'Never sent by this channel.' },
    { value: 'OPTIONAL', label: 'Optional', hint: 'Allowed, but off until the recipient turns it on.' },
    { value: 'DEFAULT', label: 'On by default', hint: 'Sent unless the recipient turns it off.' },
    { value: 'ALWAYS', label: 'Always', hint: 'Sent whatever the recipient chose.' }
  ];

  /** Every channel any topic may use, in the backend's reference order. */
  readonly channelColumns = computed(() => {
    const used = new Set(this.policies().flatMap((policy) => policy.allowedChannels));
    const ordered = this.reference().map((channel) => channel.name).filter((name) => used.has(name));
    return [...ordered, ...[...used].filter((name) => !ordered.includes(name))];
  });

  readonly canWrite = computed(() => this.context.can(PermissionConstants.NOTIFICATION_POLICY_WRITE));

  modeOf(policy: ChannelPolicy, channel: NotificationChannel): ChannelMode {
    if (policy.mandatoryChannels.includes(channel)) return 'ALWAYS';
    if (policy.defaultChannels.includes(channel)) return 'DEFAULT';
    if (policy.enabledChannels.includes(channel)) return 'OPTIONAL';
    return 'OFF';
  }

  /** Sends all three sets, so they move together and stay nested. */
  async setMode(policy: ChannelPolicy, channel: NotificationChannel, mode: ChannelMode): Promise<void> {
    const without = (list: NotificationChannel[]) => list.filter((current) => current !== channel);
    const enabledChannels = mode === 'OFF' ? without(policy.enabledChannels) : [...new Set([...policy.enabledChannels, channel])];
    const defaultChannels = mode === 'DEFAULT' || mode === 'ALWAYS' ? [...new Set([...policy.defaultChannels, channel])] : without(policy.defaultChannels);
    const mandatoryChannels = mode === 'ALWAYS' ? [...new Set([...policy.mandatoryChannels, channel])] : without(policy.mandatoryChannels);

    await this.save(policy, { enabledChannels, defaultChannels, mandatoryChannels });
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
