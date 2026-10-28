import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
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
      @if (d.description) { <p>{{ d.description }}</p> }
      <dl class="facts">
        @if (d.locationInProperty) { <div><dt>Where</dt><dd>{{ d.locationInProperty }}</dd></div> }
        @if (d.accessPreference) { <div><dt>Access</dt><dd>{{ accessLabel() }}</dd></div> }
        <div><dt>Urgency</dt><dd>{{ d.priority | humanLabel }}</dd></div>
        <div><dt>Handled by</dt><dd>{{ d.assignedToName || 'Not assigned yet' }}</dd></div>
        @if (d.scheduledDate) { <div><dt>Visit</dt><dd>{{ date(d.scheduledDate) }}</dd></div> }
        @if (d.completedDate) { <div><dt>Done</dt><dd>{{ date(d.completedDate) }}</dd></div> }
        @if (d.chargedAmount) { <div><dt>Charged to tenant</dt><dd>KES {{ money(d.chargedAmount) }}</dd></div> }
        @if (d.followUpOfNumber) { <div><dt>Follows up</dt><dd class="mono">{{ d.followUpOfNumber }}</dd></div> }
      </dl>

      @if ((d.photos ?? []).length > 0 || addPhoto()) {
        <h3 class="panel-title">Photos</h3>
        @if ((d.photos ?? []).length > 0) {
          <app-file-list variant="thumbs" [items]="photoItems()" />
        }
        @if (addPhoto(); as send) {
          @if ((d.photos ?? []).length < 6) {
            <app-file-upload [types]="photoTypes" [maxSizeMb]="10" label="Photo" uploadLabel="Add photo" [send]="send" />
          }
        }
      }

      @if ((d.events ?? []).length > 0) {
        <h3 class="panel-title">What happened</h3>
        <ol class="timeline">
          @for (event of d.events ?? []; track $index) {
            <li>
              <span class="timeline__what">{{ describe(event) }}</span>
              <span class="muted timeline__when">{{ dateTime(event.at) }}@if (event.actorName) { · {{ event.actorName }} }</span>
              @if (event.note && event.type !== 'ASSIGNED' && event.type !== 'SCHEDULED') { <span class="timeline__note">{{ event.note }}</span> }
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: [`
    .body { display: grid; gap: 0.6rem; }
    .facts { display: flex; flex-wrap: wrap; gap: 0.4rem 1.5rem; margin: 0; }
    .facts div { display: grid; gap: 0.1rem; }
    .facts dt { font-size: 0.75rem; color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: 600; }
    .panel-title { margin: 0.3rem 0 0; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); }
    .timeline { display: grid; gap: 0.45rem; margin: 0; padding-left: 1.1rem; }
    .timeline li { display: grid; gap: 0.05rem; }
    .timeline__what { font-weight: 600; font-size: 0.9rem; }
    .timeline__when { font-size: 0.78rem; }
    .timeline__note { font-size: 0.86rem; padding: 0.3rem 0.5rem; border-left: 3px solid var(--border-strong); }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MaintenanceDetailBodyComponent {
  readonly request = input.required<MaintenanceDetail>();
  /** Given, the viewer may add photos (owner or staff); the page owns the upload request. */
  readonly addPhoto = input<FileUploadSend | null>(null);

  readonly photoTypes = MAINTENANCE_PHOTO_TYPES;

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
