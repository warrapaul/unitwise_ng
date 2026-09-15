import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A labelled block of fields inside a record's summary card.
 *
 * A detail page used to be one flat grid of every column on the DTO — identity,
 * contact, tenancy and audit fields side by side at identical weight, in an
 * order the reader had to rediscover at every viewport width. Grouping fixes
 * the part that actually costs attention: "phone is under Contact" survives a
 * resize, "phone is fourth" does not.
 *
 * The same four-ish groups are used across entity types on purpose — a tenant,
 * an agency and a product all answer *what it is*, *how to reach it*, *what it
 * is doing now*, and *what the system recorded*. Learn the shape once, read any
 * page.
 *
 * Cells are projected as the `<div><dt>…</dt><dd>…</dd></div>` triples the
 * pages already write, so converting a page is wrapping, not rewriting. Mark
 * the one or two that answer the reader's question with `class="lead"`.
 */
@Component({
  selector: 'app-detail-group',
  standalone: true,
  template: `
    <section class="detail-group">
      <h3 class="detail-group__label">{{ label() }}</h3>
      <dl class="detail-grid">
        <ng-content />
      </dl>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DetailGroupComponent {
  readonly label = input.required<string>();
}
