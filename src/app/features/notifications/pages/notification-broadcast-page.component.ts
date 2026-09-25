import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FileUploadComponent } from '../../../shared/components/files/file-upload/file-upload.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { PRODUCT_IMAGE_MAX_MB, PRODUCT_IMAGE_TYPES } from '../../ecommerce/models/catalog.models';
import { NotificationsService } from '../notifications.service';
import { FcmSendResult } from '../models/notification.models';

type BroadcastTarget = 'topic' | 'token' | 'tokens';

@Component({
  selector: 'app-notification-broadcast-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SectionCardComponent, ErrorCardComponent, FileUploadComponent, FormFeedbackDirective],
  template: `
    <section class="stack">
      <form [formGroup]="form" appFormFeedback (ngSubmit)="send()">
        <app-section-card title="Send a push notification">
          <ng-container actions>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.notifications">Back</a>
          </ng-container>

          <div class="grid-auto">
            <label class="field">
              <span>Title</span>
              <input formControlName="title">
              @if (form.controls.title.invalid && form.controls.title.touched) {
                <small class="error-text">A title is required.</small>
              }
            </label>

            <label class="field">
              <span>Target</span>
              <select formControlName="target">
                <option value="topic">Topic</option>
                <option value="token">Single device token</option>
                <option value="tokens">Several device tokens</option>
              </select>
            </label>

            @if (form.controls.target.value === 'topic') {
              <label class="field">
                <span>Topic</span>
                <input formControlName="topic" placeholder="all-users">
                @if (form.controls.topic.invalid && form.controls.topic.touched) {
                  <small class="error-text">A topic is required.</small>
                }
              </label>
            } @else if (form.controls.target.value === 'token') {
              <label class="field">
                <span>Device token</span>
                <input formControlName="token">
                @if (form.controls.token.invalid && form.controls.token.touched) {
                  <small class="error-text">A device token is required.</small>
                }
              </label>
            } @else {
              <label class="field">
                <span>Device tokens</span>
                <input formControlName="tokens" placeholder="token-a, token-b">
                <small class="hint">Separate each token with a comma.</small>
                @if (form.controls.tokens.invalid && form.controls.tokens.touched) {
                  <small class="error-text">At least one device token is required.</small>
                }
              </label>
            }

            <!-- Previewed here, uploaded only when Send is pressed. -->
            <app-file-upload #image label="Image" [types]="imageTypes" [maxSizeMb]="maxSizeMb"
                             (fileChange)="selectedImage.set($event)" />
          </div>

          <label class="field field--wide">
            <span>Body</span>
            <textarea formControlName="body" rows="3"></textarea>
            @if (form.controls.body.invalid && form.controls.body.touched) {
              <small class="error-text">A body is required.</small>
            }
          </label>

          <div class="checkbox-row">
            <label class="checkbox-field">
              <input type="checkbox" formControlName="persistToDb">
              <span>Also store in the in-app inbox</span>
            </label>
            <label class="checkbox-field">
              <input type="checkbox" formControlName="highPriority">
              <span>High priority</span>
            </label>
          </div>

        </app-section-card>

        @if (sendError(); as apiError) {
          <app-error-card title="Unable to send notification" [message]="apiError.message" [details]="apiError.details" />
        }

        @if (result(); as sent) {
          <section class="alert" [class.alert-success]="sent.success" [class.alert-error]="!sent.success" role="status">
            <strong>{{ sent.success ? 'Sent' : 'Send failed' }}</strong>
            <p>
              {{ sent.successCount ?? 0 }} delivered, {{ sent.failureCount ?? 0 }} failed
              @if (sent.messageId) {
                — message {{ sent.messageId }}
              }
            </p>
            @if (sent.errorMessage) {
              <p>{{ sent.errorMessage }}</p>
            }
            @if ((sent.tokenResults ?? []).length > 0) {
              <ul>
                @for (tokenResult of sent.tokenResults ?? []; track tokenResult.token) {
                  <li>
                    {{ tokenResult.success ? 'OK' : 'Failed' }} — {{ tokenResult.token }}
                    @if (tokenResult.tokenInvalidated) {
                      (token invalidated)
                    }
                  </li>
                }
              </ul>
            }
          </section>
        }

        <div class="button-row">
          <button type="submit" class="btn btn-primary" [disabled]="sending()">
            {{ sending() ? 'Sending...' : 'Send notification' }}
          </button>
          <a class="btn btn-secondary" [routerLink]="RoutePaths.notifications">Cancel</a>
        </div>
      </form>
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .checkbox-row {
      display: flex;
      gap: 1.15rem;
      flex-wrap: wrap;
    }

    .alert p {
      margin: 0.4rem 0 0;
    }

    .alert ul {
      margin: 0.5rem 0 0;
      padding-left: 1.1rem;
      font-size: 0.85rem;
      overflow-wrap: anywhere;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationBroadcastPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly imageTypes = PRODUCT_IMAGE_TYPES;
  readonly maxSizeMb = PRODUCT_IMAGE_MAX_MB;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly notificationsService = inject(NotificationsService);

  readonly sending = signal(false);
  readonly sendError = signal<ApiError | null>(null);
  readonly result = signal<FcmSendResult | null>(null);

  readonly selectedImage = signal<File | null>(null);
  private readonly image = viewChild<FileUploadComponent>('image');

  readonly form = this.formBuilder.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    body: ['', [Validators.required, Validators.maxLength(1000)]],
    target: 'topic' as BroadcastTarget,
    topic: ['', [Validators.required]],
    token: '',
    tokens: '',
    persistToDb: true,
    highPriority: false
  });

  constructor() {
    this.form.controls.target.valueChanges.subscribe((target) => this.applyTargetValidators(target as BroadcastTarget));
  }

  async send(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.sending.set(true);
    this.sendError.set(null);
    this.result.set(null);

    const value = this.form.getRawValue();

    try {
      // The image goes up with the send, not on pick: an abandoned draft leaves nothing stored.
      const image = this.selectedImage();
      const imageFilePath = image
        ? (await firstValueFrom(this.notificationsService.uploadBroadcastMedia(image))).filePath ?? null
        : null;

      this.result.set(await firstValueFrom(this.notificationsService.sendBroadcast({
        title: value.title,
        body: value.body,
        imageFilePath,
        topic: value.target === 'topic' ? value.topic : null,
        token: value.target === 'token' ? value.token : null,
        tokens: value.target === 'tokens' ? this.parseTokens(value.tokens) : null,
        persistToDb: value.persistToDb,
        highPriority: value.highPriority
      })));
      this.image()?.clear();
    } catch (error) {
      this.sendError.set(toApiError(error));
    } finally {
      this.sending.set(false);
    }
  }

  private applyTargetValidators(target: BroadcastTarget): void {
    const controls = this.form.controls;
    controls.topic.setValidators(target === 'topic' ? [Validators.required] : []);
    controls.token.setValidators(target === 'token' ? [Validators.required] : []);
    controls.tokens.setValidators(target === 'tokens' ? [Validators.required] : []);

    controls.topic.updateValueAndValidity({ emitEvent: false });
    controls.token.updateValueAndValidity({ emitEvent: false });
    controls.tokens.updateValueAndValidity({ emitEvent: false });
  }

  private parseTokens(value: string): string[] {
    return value.split(',').map((token) => token.trim()).filter(Boolean);
  }
}
