import { ChangeDetectionStrategy, Component, computed, input, viewChild } from '@angular/core';
import { FileListComponent, FileListItem } from '../../../shared/components/files/file-list/file-list.component';
import { FileUploadComponent, FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { displayDate, displayDateTime } from '../../../shared/utils/display-date.util';
import { ACCESS_LABELS, MaintenanceDetail, MaintenanceEvent } from '../maintenance.models';

/** Photos the server accepts for a request (MAINTENANCE_PHOTO). */
export const MAINTENANCE_PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * A maintenance request as both sides read it: what and where, how to get in, who is on it and
 * when, any charge, the photos, and everything that happened in order. The tenant's page and the
 * staff list render the same record with the same component, so neither drifts.
 */
@Component({
  selector: 'app-maintenance-detail-body',
  standalone: true,
  imports: [FileListComponent, FileUploadComponent, HumanLabelPipe],
  template: `
    @let d = request();
    <div class="body">
      <div class="body__main">
        @if (d.description) { <p class="body__desc">{{ d.description }}</p> }
        <dl class="facts">
          @if (d.locationInProperty) { <div><dt>Where</dt><dd>{{ d.locationInProperty }}</dd></div> }
          @if (d.accessPreference) { <div><dt>Access</dt><dd>{{ accessLabel() }}</dd></div> }
          <!-- Urgency and who handles it are columns of the staff list already; the tenant's page shows them here. -->
          @if (showAssignment()) {
            <div><dt>Urgency</dt><dd>{{ d.priority | humanLabel }}</dd></div>
            <div><dt>Handled by</dt><dd>{{ d.assignedToName || 'Not assigned yet' }}</dd></div>
          }
          @if (d.scheduledDate) { <div><dt>Visit</dt><dd>{{ date(d.scheduledDate) }}</dd></div> }
          @if (d.completedDate) { <div><dt>Done</dt><dd>{{ date(d.completedDate) }}</dd></div> }
          @if (d.chargedAmount) { <div><dt>Charged to tenant</dt><dd>KES {{ money(d.chargedAmount) }}</dd></div> }
          @if (d.followUpOfNumber) { <div><dt>Follows up</dt><dd class="mono">{{ d.followUpOfNumber }}</dd></div> }
        </dl>

        @if ((d.photos ?? []).length > 0 || addPhoto()) {
          <section class="block">
            <div class="block__head">
              <h3 class="block__title">Photos</h3>
              <!-- A button, not a bare file field: the picker opens from it and the preview appears below. -->
              @if (addPhoto(); as send) {
                @if ((d.photos ?? []).length < 6) {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="uploader()?.open()">Add photo</button>
                }
              }
            </div>
            @if ((d.photos ?? []).length > 0) {
              <app-file-list variant="thumbs" [items]="photoItems()" />
            } @else {
              <p class="muted small">No photos yet.</p>
            }
            @if (addPhoto(); as send) {
              <app-file-upload #uploader variant="trigger" [types]="photoTypes" [maxSizeMb]="10" label="Photo" uploadLabel="Upload photo" [send]="send" />
            }
          </section>
        }
      </div>

      @if ((d.events ?? []).length > 0) {
        <section class="block body__history">
          <h3 class="block__title">What happened</h3>
          <ol class="timeline">
            @for (event of d.events ?? []; track $index) {
              <li>
                <span class="timeline__what">{{ describe(event) }}</span>
                <span class="timeline__when">{{ dateTime(event.at) }}@if (event.actorName) { · {{ event.actorName }} }</span>
                @if (event.note && event.type !== 'ASSIGNED' && event.type !== 'SCHEDULED') { <span class="timeline__note">{{ event.note }}</span> }
              </li>
            }
          </ol>
        </section>
      }
    </div>
  `,
  styles: [`
    /* Two columns when there is room: the request on the left, its history on the right. */
    .body { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr)); gap: var(--space-4) var(--space-6); align-items: start; }
    .body__main { display: grid; gap: var(--space-3); min-width: 0; }
    .body__desc { margin: 0; font-size: var(--font-body); white-space: pre-line; }
    .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: var(--space-2) var(--space-4); margin: 0; }
    .facts div { display: grid; gap: var(--space-0-5); min-width: 0; }
    .facts dt { font-size: var(--font-label); color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
    .block { display: grid; gap: var(--space-2); min-width: 0; }
    .block__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
    .block__title { margin: 0; font-size: var(--font-label); font-weight: var(--weight-bold); text-transform: uppercase;
                    letter-spacing: 0.05em; color: var(--text-muted); }
    .small { margin: 0; font-size: var(--font-description); }
    /* A rule with a dot per event, so the order reads at a glance. */
    .timeline { display: grid; gap: var(--space-3); margin: 0; padding: 0 0 0 var(--space-4); list-style: none; border-left: 2px solid var(--border); }
    .timeline li { position: relative; display: grid; gap: var(--space-0-5); }
    .timeline li::before { content: ''; position: absolute; left: calc(-1 * var(--space-4) - 5px); top: 0.4rem; width: 8px; height: 8px;
                           border-radius: 999px; background: var(--primary); }
    .timeline__what { font-weight: var(--weight-semibold); font-size: var(--font-dense); }
    .timeline__when { font-size: var(--font-caption); color: var(--text-muted); }
    .timeline__note { font-size: var(--font-description); padding: var(--space-1) var(--space-2); border-left: 3px solid var(--border-strong); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MaintenanceDetailBodyComponent {
  readonly request = input.required<MaintenanceDetail>();
  /** Given, the viewer may add photos (owner or staff); the page owns the upload request. */
  readonly addPhoto = input<FileUploadSend | null>(null);
  /** Off where urgency and the assignee are already columns of the row this sits under. */
  readonly showAssignment = input(true);

  readonly photoTypes = MAINTENANCE_PHOTO_TYPES;
  /** The hidden picker; the "Add photo" button opens it. */
  readonly uploader = viewChild<FileUploadComponent>('uploader');

  readonly accessLabel = computed(() => {
    const preference = this.request().accessPreference;
    return preference ? ACCESS_LABELS[preference] : '';
  });

  readonly photoItems = computed<FileListItem[]>(() => (this.request().photos ?? []).map((photo, index) => ({
    id: photo.id,
    name: `Photo ${index + 1}`,
    meta: photo.uploadedAt ? displayDate(photo.uploadedAt) : null,
    url: photo.url,
    contentType: photo.mimeType ?? 'image/jpeg'
  })));

  describe(event: MaintenanceEvent): string {
    switch (event.type) {
      case 'CREATED': return 'Reported';
      case 'STATUS_CHANGED': return `${this.status(event.fromStatus)} → ${this.status(event.toStatus)}`;
      case 'ASSIGNED': return event.note || 'Assigned';
      case 'SCHEDULED': return event.note || 'Visit planned';
      case 'CHARGED': return 'Charged to the tenant';
      case 'PHOTO_ADDED': return 'Photo added';
    }
  }

  private status(value: string | null | undefined): string {
    return value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : '';
  }

  money(value: number | string | null | undefined): string {
    return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '';
  }

  dateTime(value: string | null | undefined): string {
    return value ? displayDateTime(value) : '';
  }
}
