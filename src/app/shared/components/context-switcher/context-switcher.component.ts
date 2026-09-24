import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService, ContextOption } from '../../../core/services/active-context.service';
import { HousingService } from '../../../features/housing/housing.service';
import { BuildingPreview } from '../../../features/housing/models/housing.models';
import { extractErrorMessage } from '../../utils/error-message.util';

/**
 * Two-tier switcher: which role, then — inside an agency — which building.
 *
 * Each option is one role, and picking one changes what the whole app offers:
 * the nav and every permission gate render from the active role's permissions
 * alone (§30). An agency holds many buildings and most rent/tenant endpoints
 * are keyed `{agencyId}/{buildingId}`, so the second tier is needed too.
 */
@Component({
  selector: 'app-context-switcher',
  standalone: true,
  template: `
    @if (hasAnythingToSwitch()) {
    <div class="switcher" [class.switcher--inline]="inline()" (focusout)="onFocusOut($event)">
      @if (!inline()) {
        <!--
          Collapsed by default. Three selects sat permanently above the nav and
          cost more vertical space than the menu they were introducing; the
          context still has to be readable at a glance, so the trigger states it
          rather than hiding it.
        -->
        <button
          type="button"
          class="trigger"
          [class.trigger--compact]="compact()"
          [attr.aria-expanded]="open()"
          [attr.aria-label]="compact() ? 'Working context: ' + roleLabel() + (scopeLabel() ? ', ' + scopeLabel() : '') : null"
          [attr.title]="compact() ? roleLabel() + (scopeLabel() ? ' · ' + scopeLabel() : '') : null"
          aria-haspopup="dialog"
          (click)="toggle()"
          (keydown.escape)="close()"
        >
          @if (compact()) {
            <!--
              The rail has no room for the sentence, but hiding the switcher
              entirely is worse: which agency you are acting on decides what
              every screen below it shows.
            -->
            <span class="trigger__initials" aria-hidden="true">{{ initials() }}</span>
          } @else {
            <span class="trigger__text">
              <span class="trigger__role">{{ roleLabel() }}</span>
              @if (scopeLabel()) {
                <span class="trigger__scope">{{ scopeLabel() }}</span>
              }
            </span>
            <span class="trigger__caret" aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
          }
        </button>
      }

      @if (open() || inline()) {
        <div class="panel" [class.panel--pop]="!inline()" [class.panel--anchored]="compact()" (keydown.escape)="close()">
          @if (context.canSwitchRole()) {
            <label class="field">
              <span class="field__label">Role</span>
              <select (change)="onWorkspace($event)">
                @for (option of context.options(); track option.key) {
                  <option [value]="option.key" [selected]="option.key === context.active().key">{{ option.label }}</option>
                }
              </select>
            </label>
          }

          @if (context.showAgencyTier()) {
            @if (context.canSwitchAgency()) {
              <label class="field">
                <span class="field__label">Agency</span>
                <select (change)="onAgency($event)">
                  <option value="all" [selected]="context.allAgencies()">All my agencies</option>
                  @for (grant of context.agencies(); track grant.agencyId) {
                    <option [value]="grant.agencyId" [selected]="!context.allAgencies() && grant.agencyId === context.agencyId()">
                      {{ grant.agencyName ?? 'Agency #' + grant.agencyId }}
                    </option>
                  }
                </select>
              </label>
            }

            @if (context.needsAgency()) {
              <p class="hint hint--warn">Choose an agency to load its buildings and tenants.</p>
            } @else if (canSwitchBuilding()) {
              <label class="field">
                <span class="field__label">Building</span>
                <select [disabled]="loading()" (change)="onBuilding($event)">
                  <option value="" [selected]="context.buildingId() === null">
                    {{ loading() ? 'Loading…' : 'All buildings' }}
                  </option>
                  @for (building of buildings(); track building.id) {
                    <option [value]="building.id" [selected]="building.id === context.buildingId()">{{ building.name }}</option>
                  }
                </select>
                @if (error()) {
                  <small class="error-text">{{ error() }}</small>
                }
              </label>
            } @else if (error()) {
              <p class="field">
                <span class="field__label">Building</span>
                <span class="error-text">{{ error() }}</span>
              </p>
            }
          }
        </div>
      }
    </div>
    }
  `,
  styles: [`
    .switcher { position: relative; display: grid; gap: 0.4rem; }

    .trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      width: 100%;
      padding: 0.45rem 0.6rem;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .trigger:hover { border-color: var(--border-strong); }

    .trigger__text { display: grid; gap: 0.05rem; min-width: 0; }

    /*
     * In the phone header the switcher sits immediately after the wordmark. Its
     * content is packed against its own right edge, so the space the label does
     * not need falls between it and the logo rather than inside the control —
     * left-packed, the text started flush against the wordmark and the empty
     * room sat uselessly in the middle of the button.
     */
    :host-context(.topbar) .trigger { justify-content: flex-end; }
    :host-context(.topbar) .trigger__text { justify-items: end; text-align: end; }

    /*
     * A role name is the one thing in the header that must be readable, so on
     * a phone it may take two lines rather than end in an ellipsis.
     */
    :host-context(.topbar) .trigger__role {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /*
     * The header switcher sits at the right edge and is only as wide as its
     * label. Stretched to that width the panel's selects cut their options
     * short; anchored right with a width of its own, it opens leftwards over
     * the page and every option reads in full.
     */
    :host-context(.topbar) .panel--pop {
      left: auto;
      right: 0;
      width: min(18rem, calc(100vw - 1.2rem));
    }

    .trigger__role {
      font-size: 0.78rem;
      font-weight: 700;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .trigger__scope {
      font-size: 0.72rem;
      color: var(--text-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .trigger__caret { flex: none; font-size: 0.7rem; color: var(--text-muted); }

    .trigger--compact {
      justify-content: center;
      padding: 0.45rem 0.3rem;
    }

    .trigger__initials {
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }

    .panel { display: grid; gap: 0.5rem; }

    .switcher--inline .panel { gap: 0.75rem; }

    /*
     * Anchored to the trigger's left edge and given a width of its own — a panel
     * stretched to a 72px rail would be unreadable.
     */
    .panel--anchored {
      right: auto;
      min-width: 15rem;
    }

    /* Floats over the nav rather than pushing it down. */
    .panel--pop {
      position: absolute;
      z-index: 45;
      top: calc(100% + 0.3rem);
      left: 0;
      right: 0;
      padding: 0.6rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }

    .field { display: grid; gap: 0.25rem; }

    .field__label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    .field__static { font-size: 0.88rem; color: var(--text); }

    p.field { margin: 0; }

    .hint--warn { margin: 0; font-size: 0.78rem; color: var(--warning); }

    select {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      padding: 0.55rem 0.7rem;
      font-size: 0.88rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContextSwitcherComponent {
  /** Rendered expanded, without the trigger — for the context-guard prompts. */
  readonly inline = input(false);

  /** Icon-sized trigger, for the collapsed sidebar rail. */
  readonly compact = input(false);

  private readonly host = inject(ElementRef<HTMLElement>);

  readonly context = inject(ActiveContextService);
  private readonly housing = inject(HousingService);

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly allBuildings = signal<BuildingPreview[]>([]);

  /** Only worth a control when there is more than one building to choose. */
  readonly canSwitchBuilding = computed(() => this.buildings().length > 1);

  /** A BUILDING_LEVEL grant only covers the buildings it names. */
  readonly buildings = computed(() => {
    const allowed = this.context.restrictedToBuildingIds();
    const buildings = this.allBuildings();
    return allowed ? buildings.filter((building) => allowed.has(building.id)) : buildings;
  });

  /** The role being worked as — the first thing the trigger has to answer. */
  readonly roleLabel = computed(() =>
    this.context.active().roleName ?? this.context.active().label);

  /** "Riverside Court · Block B", or what is standing in for it. */
  readonly scopeLabel = computed(() => {
    const scope = this.context.active();
    // No agency tier means this role has nothing to do with agencies at all —
    // saying "No agency" would answer a question they never asked.
    if (!this.context.showAgencyTier()) {
      return '';
    }

    const agency = this.context.allAgencies()
      ? 'All my agencies'
      : scope.agencyName ?? 'Select an agency';

    return scope.buildingName ? `${agency} · ${scope.buildingName}` : `${agency} · All buildings`;
  });

  /**
   * Whether there is a choice to make at all.
   *
   * One role, one agency and at most one building is not a context to switch —
   * it is the only context there is. A control that opens a panel of read-only
   * facts costs a tap to learn nothing, and it sits in the most valuable strip
   * of the screen. The current context is still stated on the trigger of the
   * phone header, so hiding this loses no information.
   *
   * Each tier counts as switchable only above one option, which is also why the
   * building tier does not appear while an agency has none.
   */
  readonly hasAnythingToSwitch = computed(() =>
    this.context.canSwitchRole()
    || this.context.canSwitchAgency()
    || this.canSwitchBuilding()
    // Nothing is selected yet, so the operator has to be able to choose.
    || this.context.needsAgency());

  /** Two letters for the rail: the agency's, or the role's when there is none. */
  readonly initials = computed(() => {
    const source = this.context.active().agencyName || this.roleLabel();
    const words = source.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      return '··';
    }

    return (words.length === 1
      ? words[0].slice(0, 2)
      : words[0][0] + words[1][0]).toUpperCase();
  });

  toggle(): void {
    this.open.update((value) => !value);
  }

  close(): void {
    this.open.set(false);
  }

  /** Dismiss only when focus leaves the switcher, not when it moves inside it. */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) {
      return;
    }

    this.close();
  }

  /**
   * The touch backstop. `focusout` is a focus event, and tapping something
   * unfocusable — the nav, the page behind — moves no focus at all, so on a
   * phone the panel stayed open until the operator happened to tap a control.
   */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) {
      return;
    }

    const target = event.target as Node | null;
    if (target && !(this.host.nativeElement as HTMLElement).contains(target)) {
      this.close();
    }
  }

  constructor() {
    // Reload whenever the active agency changes; clear when leaving agency mode.
    effect(() => {
      const agencyId = this.context.agencyId();
      if (agencyId === null) {
        this.allBuildings.set([]);
        return;
      }

      void this.loadBuildings(agencyId);
    });

    // Publish how many buildings the operator can reach, so a list page can
    // drop a building filter that would only ever offer one (§29.11). Unknown
    // while loading, and when no agency is chosen.
    effect(() => {
      const known = this.context.agencyId() !== null && !this.loading() && !this.error();
      this.context.setReachableBuildingCount(known ? this.buildings().length : null);
    });
  }

  onAgency(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'all') {
      this.context.clearAgency();
      return;
    }

    if (value) {
      this.context.selectAgency(Number(value));
    }

    // Left open deliberately: choosing an agency loads its buildings, and
    // picking one of those is almost always the next thing the operator does.
  }

  onWorkspace(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    const option = this.context.options().find((candidate: ContextOption) => candidate.key === key);
    if (option) {
      this.context.selectWorkspace(option);
      this.close();
    }
  }

  onBuilding(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) {
      this.context.clearBuilding();
      this.close();
      return;
    }

    const buildingId = Number(value);
    const building = this.buildings().find((candidate) => candidate.id === buildingId);
    this.context.selectBuilding(buildingId, building?.name ?? null);
    this.close();
  }

  private async loadBuildings(agencyId: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.housing.getBuildingsForAgency(agencyId, { page: 0, size: 200 }));
      this.allBuildings.set(result.items);

      // Auto-select when exactly one building is reachable, so single-building
      // agencies never make the operator pick.
      const reachable = this.buildings();
      if (reachable.length === 1 && this.context.buildingId() === null) {
        this.context.selectBuilding(reachable[0].id, reachable[0].name);
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
      this.allBuildings.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
