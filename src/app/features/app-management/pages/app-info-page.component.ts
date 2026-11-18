import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../core/services/notification.service';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FileUploadComponent, FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { phoneValidator } from '../../../shared/utils/phone.validator';
import { AppManagementService } from '../app-management.service';
import { DemoVideoFile, SocialLink, Testimonial } from '../models/app-management.models';

/** Help & support, the privacy policy and terms, and what the public landing page says about the company: one record, edited here. */
@Component({
  selector: 'app-app-info-page',
  standalone: true,
  imports: [ReactiveFormsModule, LoadingStateComponent, ErrorStateComponent, ErrorCardComponent, FieldErrorComponent, SectionCardComponent,
    FileUploadComponent, FormFeedbackDirective, DateDisplayDirective],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading…" />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="load()" />
    } @else {
      <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <app-section-card title="Help & support" subtitle="Shown on the Help page, for problems with the app.">
          <div class="grid-auto">
            <label class="field"><span>Phone</span><input type="tel" inputmode="tel" formControlName="supportPhone">
              <app-field-error [control]="form.controls.supportPhone" label="Phone" /></label>
            <label class="field"><span>WhatsApp</span><input type="tel" inputmode="tel" formControlName="supportWhatsapp">
              <app-field-error [control]="form.controls.supportWhatsapp" label="WhatsApp" /></label>
            <label class="field"><span>Email</span><input type="email" inputmode="email" formControlName="supportEmail">
              <app-field-error [control]="form.controls.supportEmail" label="Email" /></label>
            <label class="field"><span>Hours</span><input formControlName="supportHours" maxlength="150"></label>
          </div>
          <label class="field field--wide"><span>Note on the Help page</span><textarea formControlName="helpText" rows="3" maxlength="2000"></textarea></label>
        </app-section-card>

        <app-section-card title="Privacy policy" subtitle="Plain text; blank lines start a new paragraph.">
          <label class="field field--wide"><span>Policy</span><textarea formControlName="privacyPolicy" rows="16"></textarea></label>
          <label class="field"><span>Last updated</span><input type="date" appDateDisplay formControlName="privacyUpdatedOn"></label>
          <small class="hint">Left blank, it moves to today whenever the policy text changes.</small>
        </app-section-card>

        <app-section-card title="Terms of service" subtitle="Linked from the landing page footer and sign-up. Plain text; blank lines start a new paragraph.">
          <label class="field field--wide"><span>Terms</span><textarea formControlName="termsOfService" rows="12"></textarea></label>
          <label class="field"><span>Last updated</span><input type="date" appDateDisplay formControlName="termsUpdatedOn"></label>
          <small class="hint">Left blank, it moves to today whenever the terms change.</small>
        </app-section-card>

        <app-section-card title="Demo video" subtitle="Plays on the landing page. Once one is set, “Watch the demo” becomes the page’s main button.">
          <fieldset class="choice">
            <legend>Play</legend>
            <label class="radio-field">
              <input type="radio" formControlName="demoVideoSource" value="LINK">
              <span><strong>A link</strong><small>A video on YouTube or Vimeo, or any https:// MP4 or WebM file.</small></span>
            </label>
            <label class="radio-field" [class.radio-field--off]="!demoFile()">
              <input type="radio" formControlName="demoVideoSource" value="FILE" [attr.disabled]="demoFile() ? null : true">
              <span><strong>A file uploaded here</strong><small>{{ demoFile() ? 'Stored with the app’s files and played from there.' : 'Upload one below to choose this.' }}</small></span>
            </label>
          </fieldset>

          <label class="field field--wide"><span>Video link</span><input type="url" formControlName="demoVideoUrl" placeholder="https://www.youtube.com/watch?v=…"
                 (paste)="onVideoPaste($event)" (blur)="tidyVideoLink()">
            <small class="hint">Paste the video’s link, or YouTube’s Share → Embed code. Kept even while the uploaded file plays, so you can switch back.</small>
            <app-field-error [control]="form.controls.demoVideoUrl" label="Video link" /></label>

          @if (demoFile(); as file) {
            <h3 class="subhead">Uploaded file</h3>
            <div class="video-file">
              <video [src]="file.url" controls preload="metadata" playsinline></video>
              <p><strong>{{ file.fileName }}</strong>@if (file.fileSize) { · {{ megabytes(file.fileSize) }} }</p>
              <div class="button-row button-row--start">
                <button type="button" class="btn btn-secondary btn-sm" [disabled]="uploading() || removing()" (click)="replacer.open()">Replace</button>
                <button type="button" class="btn btn-text btn-sm" [disabled]="uploading() || removing()" (click)="removeDemo()">{{ removing() ? 'Removing…' : 'Remove' }}</button>
              </div>
            </div>
            <app-file-upload #replacer variant="trigger" [types]="videoTypes" [maxSizeMb]="100" uploadLabel="Upload and use this" [send]="sendDemo" />
          } @else {
            <app-file-upload label="Or upload a video file" [types]="videoTypes" [maxSizeMb]="100" uploadLabel="Upload and use this" [send]="sendDemo"
                             hint="MP4 or WebM, up to 100 MB. Around 20 MB plays smoothly on mobile data." />
          }
          @if (uploading()) {
            <div class="upload-progress" role="status">
              <div class="progress"><span [style.width.%]="progress()"></span></div>
              <small>Uploading… {{ progress() }}%</small>
            </div>
          }
          @if (videoError(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
        </app-section-card>

        <app-section-card title="Landing page" subtitle="Each part of the public page shows only when it is filled in here.">
          <div class="grid-auto">
            <label class="field"><span>Company name</span><input formControlName="companyName" maxlength="150"></label>
            <label class="field"><span>Registration number</span><input formControlName="companyRegistration" maxlength="60"></label>
            <label class="field"><span>Data protection registration</span><input formControlName="dataProtectionRegistration" maxlength="60">
              <small class="hint">Your certificate number from the Office of the Data Protection Commissioner.</small></label>
            <label class="field"><span>Address</span><input formControlName="companyAddress" maxlength="255"></label>
          </div>
          <h3 class="subhead">Social links</h3>
          @for (link of socialLinks(); track $index) {
            <div class="row-edit">
              <label class="field"><span>Name</span><input [value]="link.label" (input)="editSocial($index, 'label', $any($event.target).value)" maxlength="40"></label>
              <label class="field grow"><span>Link</span><input type="url" [value]="link.url" (input)="editSocial($index, 'url', $any($event.target).value)" maxlength="300"></label>
              <button type="button" class="btn btn-secondary btn-sm" (click)="removeSocial($index)" [attr.aria-label]="'Remove ' + (link.label || 'link')">Remove</button>
            </div>
          }
          @if (socialLinks().length < 8) { <button type="button" class="btn btn-secondary btn-sm add" (click)="addSocial()">Add a social link</button> }

          <h3 class="subhead">What customers say</h3>
          <p class="hint">Only real customers, with their permission. The section is hidden while this is empty.</p>
          @for (t of testimonials(); track $index) {
            <div class="testimonial-edit">
              <label class="field field--wide"><span>What they said</span><textarea rows="2" [value]="t.quote" (input)="editTestimonial($index, 'quote', $any($event.target).value)" maxlength="400"></textarea></label>
              <div class="row-edit">
                <label class="field"><span>Name</span><input [value]="t.name" (input)="editTestimonial($index, 'name', $any($event.target).value)" maxlength="80"></label>
                <label class="field grow"><span>Who they are</span><input [value]="t.role ?? ''" (input)="editTestimonial($index, 'role', $any($event.target).value)" maxlength="120"></label>
                <button type="button" class="btn btn-secondary btn-sm" (click)="removeTestimonial($index)">Remove</button>
              </div>
            </div>
          }
          @if (testimonials().length < 12) { <button type="button" class="btn btn-secondary btn-sm add" (click)="addTestimonial()">Add a testimonial</button> }

          <label class="switch-row stats-switch">
            <span><strong>Show live platform numbers</strong><br><span class="muted">Agencies, rooms and rent recorded, counted from the app. Leave off until they are worth showing.</span></span>
            <input type="checkbox" role="switch" class="switch" formControlName="showPlatformStats">
          </label>
        </app-section-card>

        @if (listError()) { <p class="error-text" role="alert">{{ listError() }}</p> }
        @if (saveError(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
        <div class="button-row">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    }
  `,
  styles: [`
    .subhead { margin: var(--space-4) 0 var(--space-1); font-size: var(--font-section-label); font-weight: var(--weight-semibold); }
    .row-edit { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2) var(--space-3); margin-bottom: var(--space-2); }
    .row-edit .field { flex: 1 1 10rem; }
    .row-edit .grow { flex: 3 1 16rem; }
    .testimonial-edit { padding: var(--space-3); margin-bottom: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .add { margin-top: var(--space-1); }
    .stats-switch { margin-top: var(--space-4); font-weight: var(--weight-regular); }
    .choice { display: grid; gap: var(--space-2); margin: 0 0 var(--space-3); padding: 0; border: 0; }
    .choice legend { margin-bottom: var(--space-1); font-weight: var(--weight-semibold); font-size: var(--font-label); }
    .choice .radio-field { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-md); cursor: pointer; }
    .choice .radio-field:has(input:checked) { border-color: var(--primary); background: var(--primary-soft); }
    .choice .radio-field small { display: block; margin-top: 2px; color: var(--text-muted); font-size: var(--text-sm); }
    .choice .radio-field--off { opacity: 0.65; cursor: not-allowed; }
    .video-file { display: grid; gap: var(--space-2); max-width: 32rem; }
    .video-file video { width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius-md); background: #000; }
    .video-file p { margin: 0; overflow-wrap: anywhere; }
    .button-row--start { justify-content: flex-end; }
    .upload-progress { display: grid; gap: var(--space-1); max-width: 32rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppInfoPageComponent implements OnInit, HasUnsavedChanges {
  private readonly service = inject(AppManagementService);
  private readonly toasts = inject(NotificationService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = inject(NonNullableFormBuilder).group({
    supportPhone: ['', [phoneValidator()]],
    supportWhatsapp: ['', [phoneValidator()]],
    supportEmail: ['', [Validators.email]],
    supportHours: '',
    helpText: '',
    privacyPolicy: '',
    privacyUpdatedOn: '',
    termsOfService: '',
    termsUpdatedOn: '',
    companyName: '',
    companyRegistration: '',
    companyAddress: '',
    dataProtectionRegistration: '',
    demoVideoUrl: ['', [Validators.pattern(/^(https:\/\/.+)?$/), Validators.maxLength(500)]],
    demoVideoSource: 'LINK' as 'LINK' | 'FILE',
    showPlatformStats: false
  });

  readonly socialLinks = signal<SocialLink[]>([]);
  readonly testimonials = signal<Testimonial[]>([]);
  readonly listError = signal<string | null>(null);
  readonly demoFile = signal<DemoVideoFile | null>(null);
  readonly uploading = signal(false);
  readonly removing = signal(false);
  readonly progress = signal(0);
  readonly videoError = signal<string | null>(null);
  readonly videoTypes = ['video/mp4', 'video/webm'] as const;
  private listsDirty = false;

  addSocial(): void { this.socialLinks.update((list) => [...list, { label: '', url: 'https://' }]); this.listsDirty = true; }
  removeSocial(i: number): void { this.socialLinks.update((list) => list.filter((_, at) => at !== i)); this.listsDirty = true; }
  editSocial(i: number, key: keyof SocialLink, value: string): void {
    this.socialLinks.update((list) => list.map((item, at) => at === i ? { ...item, [key]: value } : item)); this.listsDirty = true;
  }
  addTestimonial(): void { this.testimonials.update((list) => [...list, { quote: '', name: '', role: '' }]); this.listsDirty = true; }
  removeTestimonial(i: number): void { this.testimonials.update((list) => list.filter((_, at) => at !== i)); this.listsDirty = true; }
  editTestimonial(i: number, key: keyof Testimonial, value: string): void {
    this.testimonials.update((list) => list.map((item, at) => at === i ? { ...item, [key]: value } : item)); this.listsDirty = true;
  }

  ngOnInit(): void {
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return (this.form.dirty || this.listsDirty) && !this.saving();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const info = await firstValueFrom(this.service.getAppInfo());
      this.form.reset({
        supportPhone: info.supportPhone ?? '', supportWhatsapp: info.supportWhatsapp ?? '', supportEmail: info.supportEmail ?? '',
        supportHours: info.supportHours ?? '', helpText: info.helpText ?? '', privacyPolicy: info.privacyPolicy ?? '',
        privacyUpdatedOn: '', termsOfService: info.termsOfService ?? '', termsUpdatedOn: '',
        companyName: info.companyName ?? '', companyRegistration: info.companyRegistration ?? '', companyAddress: info.companyAddress ?? '',
        dataProtectionRegistration: info.dataProtectionRegistration ?? '', demoVideoUrl: info.demoVideoLink ?? '',
        demoVideoSource: info.demoVideoSource ?? 'LINK',
        showPlatformStats: !!info.showPlatformStats
      });
      this.demoFile.set(info.demoVideoFile ?? null);
      this.socialLinks.set(info.socialLinks ?? []);
      this.testimonials.set(info.testimonials ?? []);
      this.listsDirty = false;
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Uploads straight away: a file this size should not wait for the page's Save. It plays once stored. */
  readonly sendDemo: FileUploadSend = async ([file]) => {
    this.uploading.set(true);
    this.progress.set(0);
    this.videoError.set(null);
    try {
      const last = await lastValueFrom(this.service.uploadDemoVideo(file).pipe(tap((event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) this.progress.set(Math.round((event.loaded / event.total) * 100));
      })));
      const info = last.type === HttpEventType.Response ? last.body?.data : null;
      this.demoFile.set(info?.demoVideoFile ?? null);
      this.setSource('FILE');
      this.toasts.push('success', 'Demo video uploaded. It now plays on the landing page.');
      return true;
    } catch (error) {
      this.videoError.set(extractErrorMessage(error));
      return false;
    } finally {
      this.uploading.set(false);
    }
  };

  async removeDemo(): Promise<void> {
    this.removing.set(true);
    this.videoError.set(null);
    try {
      const info = await firstValueFrom(this.service.removeDemoVideo());
      this.demoFile.set(info.demoVideoFile ?? null);
      this.setSource('LINK');
      this.toasts.push('success', this.form.controls.demoVideoUrl.value ? 'Uploaded video removed. The link plays instead.' : 'Uploaded video removed.');
    } catch (error) {
      this.videoError.set(extractErrorMessage(error));
    } finally {
      this.removing.set(false);
    }
  }

  /** The server has already switched; the radio follows without counting as an unsaved change. */
  private setSource(source: 'LINK' | 'FILE'): void {
    const control = this.form.controls.demoVideoSource;
    control.setValue(source);
    control.markAsPristine();
  }

  /** YouTube's Share → Embed gives an <iframe> snippet: keep only the link inside it. */
  onVideoPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const link = this.embedSrc(text);
    if (!link) return;
    event.preventDefault();
    this.form.controls.demoVideoUrl.setValue(link);
    this.form.controls.demoVideoUrl.markAsDirty();
  }

  tidyVideoLink(): void {
    const control = this.form.controls.demoVideoUrl;
    const link = this.embedSrc(control.value);
    if (link) control.setValue(link);
    else if (control.value !== control.value.trim()) control.setValue(control.value.trim());
  }

  private embedSrc(text: string): string | null {
    const match = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(text);
    return match ? match[1].replace(/&amp;/g, '&') : null;
  }

  megabytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async save(): Promise<void> {
    const socials = this.socialLinks().filter((link) => link.label.trim() || link.url.trim().replace(/^https:\/\/$/, ''));
    const quotes = this.testimonials().filter((t) => t.quote.trim() || t.name.trim());
    this.listError.set(
      socials.some((link) => !link.label.trim() || !/^https:\/\/.+/.test(link.url.trim())) ? 'Each social link needs a name and an https:// link.'
        : quotes.some((t) => !t.quote.trim() || !t.name.trim()) ? 'Each testimonial needs what they said and their name.' : null);
    if (this.form.invalid || this.listError()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await firstValueFrom(this.service.saveAppInfo({ ...value, privacyUpdatedOn: value.privacyUpdatedOn || null,
        termsUpdatedOn: value.termsUpdatedOn || null, socialLinks: socials, testimonials: quotes }));
      this.form.markAsPristine();
      this.listsDirty = false;
      this.toasts.push('success', 'Saved.');
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
