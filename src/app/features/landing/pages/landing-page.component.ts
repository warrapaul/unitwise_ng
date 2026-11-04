import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { RoutePaths } from '../../../core/routes/route-paths';

const UNSPLASH = 'https://images.unsplash.com';

/**
 * The public face of the product.
 *
 * Deliberately outside the app shell: no sidebar, no context switcher, no role.
 * Someone arriving from a link is deciding whether this is for them, and the
 * operator chrome answers a question they have not asked yet.
 *
 * Photography is hot-linked from Unsplash's CDN with explicit `w`/`q` params so
 * the browser fetches a sized file rather than a 4MB original. Every id here was
 * checked to resolve; swap them for owned assets before launch.
 *
 * Copy describes only what the product does today: no invented customer
 * counts, ratings or testimonials. The hero card's figures are marked as sample data.
 */
@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="landing">
      <header class="bar">
        <a class="brand" [routerLink]="RoutePaths.splash">
          <span class="brand__mark" aria-hidden="true">U</span>
          <span class="brand__name">Unitwise</span>
        </a>

        <nav class="bar__nav">
          <!-- <a class="bar__link" [routerLink]="RoutePaths.availableRooms">Find a room</a>
          <a class="bar__link" [routerLink]="RoutePaths.shop">Shop</a> -->
          @if (session.isAuthenticated()) {
            <a class="btn btn-primary" [routerLink]="RoutePaths.home">Open dashboard</a>
          } @else {
            <a class="bar__link" [routerLink]="RoutePaths.login">Sign in</a>
            <a class="btn btn-primary" [routerLink]="RoutePaths.signup">Get started free</a>
          }
        </nav>
      </header>

      <main>
        <!-- HERO -->
        <section class="hero">
          <div class="hero__copy">
            <span class="eyebrow-pill">For landlords &amp; letting agents in Kenya</span>
            <h1>Know who has paid —<br>without a single phone call.</h1>
            <p class="lede">
              Unitwise bills every room, takes rent straight into your own M-Pesa PayBill or till,
              matches each payment to the right tenant, and shows you who still owes — on your
              phone, for every building you own.
            </p>

            <div class="hero__actions">
              <a class="btn btn-primary btn-lg" [routerLink]="RoutePaths.signup">Start your free trial</a>
              <button type="button" class="btn btn-secondary btn-lg" (click)="scrollTo('how-it-works')">See how a month runs</button>
            </div>

            <ul class="ticks">
              <li>Rent goes straight to your PayBill — we never hold your money</li>
              <li>Tenants pay from an M-Pesa prompt</li>
              <li>Works on any phone</li>
            </ul>
          </div>

          <div class="hero__art">
            <img
              class="hero__photo"
              [src]="img('photo-1560518883-ce09059eeffa', 900)"
              alt="Apartment block exterior"
              loading="eager"
              width="900"
              height="600"
            >

            <aside class="card card--float">
              <p class="card__eyebrow">Collections · this month</p>
              <p class="card__figure">KES 1,240,000</p>
              <div class="chart" role="img" aria-label="Monthly rent collected, April to September, trending upward">
                @for (bar of bars; track bar.label) {
                  <div class="chart__col">
                    <div class="chart__track">
                      <div class="chart__fill" [style.height.%]="bar.value"></div>
                    </div>
                    <span class="chart__label">{{ bar.label }}</span>
                  </div>
                }
              </div>
              <p class="card__foot">96% on time · Sample data</p>
            </aside>
          </div>
        </section>

        <!-- WHAT CHANGES -->
        <section class="proof" aria-label="What changes">
          @for (stat of stats; track stat.label) {
            <div class="proof__item">
              <strong>{{ stat.value }}</strong>
              <span>{{ stat.label }}</span>
            </div>
          }
        </section>

        <!-- BEFORE / AFTER -->
        <section class="section">
          <header class="section__head">
            <span class="eyebrow">Why landlords switch</span>
            <h2>Rent day, before and after</h2>
            <p class="section__lede">
              The work does not disappear — it stops landing on you. Here is the same month, run two ways.
            </p>
          </header>

          <div class="compare">
            @for (row of compare; track row.topic) {
              <article class="compare__row">
                <h3>{{ row.topic }}</h3>
                <p class="compare__before"><span class="compare__tag">Today</span>{{ row.before }}</p>
                <p class="compare__after"><span class="compare__tag">With Unitwise</span>{{ row.after }}</p>
              </article>
            }
          </div>
        </section>

        <!-- HOW A MONTH RUNS -->
        <section class="section" id="how-it-works">
          <header class="section__head">
            <span class="eyebrow">How a month runs</span>
            <h2>From bills out to money in, in four steps</h2>
            <p class="section__lede">
              The same four steps every month, in the order they happen. Each one is a screen you open,
              not a spreadsheet you rebuild.
            </p>
          </header>

          <div class="features">
            @for (feature of features; track feature.title) {
              <article class="feature">
                <img
                  class="feature__photo"
                  [src]="img(feature.photo, 520)"
                  [alt]="feature.alt"
                  loading="lazy"
                  width="520"
                  height="340"
                >
                <div class="feature__body">
                  <span class="feature__n">Step {{ $index + 1 }}</span>
                  <h3>{{ feature.title }}</h3>
                  <p>{{ feature.body }}</p>
                </div>
              </article>
            }
          </div>
        </section>

        <!-- TENANT SIDE -->
        <section class="section section--tint">
          <div class="tenant">
            <header class="section__head">
              <span class="eyebrow">What your tenants get</span>
              <h2>Tenants who can see their balance stop asking you for it</h2>
              <p class="section__lede">
                Every tenant gets their own sign-in. Half of the calls a landlord takes are questions the
                tenant's own screen now answers.
              </p>
            </header>
            <ul class="tenant__list">
              @for (item of tenantSide; track item.title) {
                <li>
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.body }}</span>
                </li>
              }
            </ul>
          </div>
        </section>

        <!-- CAPABILITIES -->
        <section class="section">
          <header class="section__head">
            <span class="eyebrow">Everything in the box</span>
            <h2>One system instead of a notebook, three spreadsheets and a WhatsApp group</h2>
            <p class="section__lede">
              Not a roadmap. Every item below is a working screen in the product today.
            </p>
          </header>

          <div class="caps">
            @for (group of capabilities; track group.title) {
              <article class="cap">
                <h3>{{ group.title }}</h3>
                <p class="cap__lede">{{ group.body }}</p>
                <ul class="cap__list">
                  @for (item of group.items; track item) {
                    <li>{{ item }}</li>
                  }
                </ul>
              </article>
            }
          </div>
        </section>

        <!-- ROLES -->
        <section class="section section--tint">
          <header class="section__head">
            <span class="eyebrow">Your whole team, one system</span>
            <h2>Everyone sees their part — and nothing else</h2>
            <p class="section__lede">
              Give a caretaker one building and that is all they will ever see. Add an accountant without
              handing over the keys to everything. You keep the whole picture.
            </p>
          </header>

          <div class="roles">
            @for (role of roles; track role.title) {
              <article class="role">
                <img class="role__avatar" [src]="img(role.photo, 160)" [alt]="role.alt" loading="lazy" width="160" height="160">
                <h3>{{ role.title }}</h3>
                <p>{{ role.body }}</p>
              </article>
            }
          </div>
        </section>

        <!-- GETTING STARTED -->
        <section class="section">
          <header class="section__head">
            <span class="eyebrow">Getting started</span>
            <h2>Running by the end of the afternoon</h2>
            <p class="section__lede">Start with one building. Add the rest when you are sure.</p>
          </header>

          <ol class="steps">
            @for (step of steps; track step.title) {
              <li class="step">
                <span class="step__n">{{ $index + 1 }}</span>
                <h3>{{ step.title }}</h3>
                <p>{{ step.body }}</p>
              </li>
            }
          </ol>
        </section>

        <!-- QUESTIONS -->
        <section class="section">
          <header class="section__head">
            <span class="eyebrow">Questions landlords ask</span>
            <h2>Before you sign up</h2>
          </header>

          <div class="faq">
            @for (item of faq; track item.q) {
              <details class="faq__item">
                <summary>{{ item.q }}</summary>
                <p>{{ item.a }}</p>
              </details>
            }
          </div>
        </section>

        <!-- CTA -->
        <section class="cta">
          <div class="cta__copy">
            <h2>Make next month the last one you chase by phone.</h2>
            <p>Add one building today, send your tenants their sign-in, and watch the payments match
              themselves by month end.</p>
            <div class="hero__actions">
              <a class="btn btn-primary btn-lg" [routerLink]="RoutePaths.signup">Start your free trial</a>
              <a class="btn btn-secondary btn-lg" [routerLink]="RoutePaths.login">Sign in</a>
            </div>
          </div>
        </section>
      </main>

      <footer class="foot">
        <div class="brand">
          <span class="brand__mark" aria-hidden="true">U</span>
          <span class="brand__name">Unitwise</span>
        </div>
        <p class="muted">Property management for Kenyan landlords and letting agents.</p>
        <p class="muted">Photography: Unsplash</p>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; background: var(--surface); }

    .landing {
      --gutter: clamp(1rem, 5vw, 4rem);
      display: grid;
      gap: clamp(2.5rem, 7vw, 5rem);
      padding-bottom: 0;
    }

    /* ---- top bar ---- */
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
      padding: var(--space-4) var(--gutter) 0;
    }

    .brand { display: flex; align-items: center; gap: var(--space-2-5); text-decoration: none; color: var(--text); }

    .brand__mark {
      display: grid; place-items: center;
      width: 2rem; height: 2rem;
      border-radius: var(--radius-sm);
      background: var(--primary); color: var(--on-accent); font-weight: var(--weight-bold);
    }

    .brand__name { font-weight: var(--weight-bold); letter-spacing: -0.01em; }

    .bar__nav { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; }

    .bar__link {
      color: var(--text-muted);
      text-decoration: none;
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
    }

    .bar__link:hover { color: var(--text); }

    /* ---- hero ---- */
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
      gap: clamp(var(--space-6), 5vw, 3.5rem);
      align-items: center;
      padding: clamp(var(--space-4), 4vw, 2.5rem) var(--gutter) 0;
    }

    .hero__copy { display: grid; gap: var(--space-4); align-content: start; }

    .eyebrow-pill {
      justify-self: start;
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      font-size: var(--text-xs);
      font-weight: var(--weight-bold);
      color: var(--text-muted);
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(2.1rem, 5.2vw, 3.6rem);
      line-height: 1.05;
      letter-spacing: -0.03em;
      font-weight: var(--weight-bold);
    }

    .lede { margin: 0; font-size: clamp(1rem, 1.6vw, 1.12rem); color: var(--text-muted); max-width: 46ch; }

    .hero__actions { display: flex; gap: var(--space-2-5); flex-wrap: wrap; }

    .ticks { margin: var(--space-1) 0 0; padding: 0; list-style: none; display: flex; gap: var(--space-4) var(--space-6); flex-wrap: wrap; }

    .ticks li { position: relative; padding-left: var(--space-5); font-size: var(--text-sm); color: var(--text-muted); }

    .ticks li::before {
      content: '✓';
      position: absolute; left: 0;
      color: var(--success); font-weight: var(--weight-bold);
    }

    /* ---- hero art ---- */
    .hero__art { position: relative; }

    .hero__photo {
      width: 100%;
      height: clamp(19rem, 40vw, 27rem);
      object-fit: cover;
      border-radius: var(--radius-lg);
      display: block;
      box-shadow: var(--shadow-lg);
    }

    .card {
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      padding: var(--space-4) var(--space-4);
      display: grid;
      gap: var(--space-2);
    }

    .card--float {
      position: absolute;
      left: clamp(-1rem, -2vw, 0rem);
      bottom: -1.75rem;
      width: min(19rem, 82%);
    }

    .card__eyebrow {
      margin: 0;
      font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: 0.09em;
      text-transform: uppercase; color: var(--text-muted);
    }

    .card__figure { margin: 0; font-size: var(--text-2xl); font-weight: var(--weight-bold); letter-spacing: -0.02em; }

    .card__foot { margin: 0; font-size: var(--text-2xs); color: var(--text-muted); }

    /*
     * The bars need a track with real height for a percentage to resolve
     * against — the previous version put height:% on a span whose parent had no
     * definite height, so every bar collapsed to a line.
     */
    .chart { display: grid; grid-auto-flow: column; gap: var(--space-1-5); align-items: end; }

    .chart__col { display: grid; gap: var(--space-1-5); justify-items: center; }

    .chart__track { display: flex; align-items: flex-end; height: 3.5rem; width: 100%; }

    .chart__fill {
      width: 100%;
      border-radius: 5px 5px 2px 2px;
      background: linear-gradient(180deg, var(--sage, #6e8c74), var(--primary));
      min-height: 0.3rem;
    }

    .chart__label { font-size: var(--text-2xs); color: var(--text-muted); }

    /* ---- proof strip ---- */
    .proof {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
      gap: var(--space-4);
      margin: var(--space-8) var(--gutter) 0;
      padding: var(--space-5) var(--space-4);
      border-block: 1px solid var(--border);
    }

    .proof__item { display: grid; justify-items: center; gap: var(--space-0-5); text-align: center; }
    .proof__item strong { font-size: clamp(1.3rem, 2.4vw, 1.8rem); letter-spacing: -0.02em; }
    .proof__item span { font-size: var(--text-xs); color: var(--text-muted); }

    /* ---- sections ---- */
    .section { padding-inline: var(--gutter); display: grid; gap: var(--space-6); }

    .section--tint {
      background: var(--surface-2);
      padding-block: clamp(var(--space-8), 5vw, 3.5rem);
    }

    .section__head { display: grid; gap: var(--space-1-5); max-width: 56ch; }

    .eyebrow {
      font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--primary);
    }

    .section__head h2 {
      margin: 0;
      font-size: clamp(1.5rem, 3.2vw, 2.2rem);
      letter-spacing: -0.02em;
      line-height: 1.15;
    }

    .section__lede { margin: 0; color: var(--text-muted); }

    /* ---- features ---- */
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
      gap: var(--space-4);
    }

    .feature {
      display: grid;
      grid-template-rows: auto 1fr;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--surface);
    }

    .feature__photo { width: 100%; height: 9rem; object-fit: cover; display: block; }
    .feature__body { padding: var(--space-4) var(--space-4) var(--space-4); display: grid; gap: var(--space-1-5); align-content: start; }
    .feature h3 { margin: 0; font-size: var(--text-base); }
    .feature p { margin: 0; font-size: var(--text-md); color: var(--text-muted); }

    /* ---- capabilities ----
       Text-only and dense on purpose: the photo cards above sell the idea, this
       block answers "but does it do X" without making anyone scroll a brochure. */
    .caps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
      gap: var(--space-4);
      align-items: start;
    }

    .cap {
      display: grid;
      gap: var(--space-2);
      align-content: start;
      padding: var(--space-4) var(--space-5) var(--space-5);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
    }

    .cap h3 { margin: 0; font-size: var(--text-base); }

    .cap__lede {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    .cap__list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: var(--space-1-5);
      font-size: var(--text-sm);
    }

    .cap__list li {
      display: grid;
      grid-template-columns: 0.85rem 1fr;
      gap: var(--space-2);
      align-items: baseline;
    }

    /* The tick is decoration; the text carries the meaning. */
    .cap__list li::before {
      content: '';
      width: 0.42rem;
      height: 0.42rem;
      border-radius: 50%;
      background: var(--primary);
      transform: translateY(-0.1rem);
    }

    /* ---- roles ---- */
    .roles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
      gap: var(--space-4);
    }

    .role {
      display: grid; gap: var(--space-1-5); align-content: start;
      padding: var(--space-4) var(--space-4);
      border-radius: var(--radius-md);
      background: var(--surface);
      border: 1px solid var(--border);
    }

    .role__avatar { width: 3rem; height: 3rem; border-radius: 999px; object-fit: cover; }
    .role h3 { margin: 0; font-size: var(--text-base); }
    .role p { margin: 0; font-size: var(--text-sm); color: var(--text-muted); }

    /* ---- before / after ---- */
    .compare { display: grid; gap: var(--space-3); }
    .compare__row {
      display: grid;
      grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--space-4);
      align-items: start;
      padding: var(--space-4) var(--space-5);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--card-bg);
    }
    .compare__row h3 { margin: 0; font-size: var(--text-base); }
    .compare__row p { margin: 0; display: grid; gap: var(--space-1); font-size: var(--text-md); }
    .compare__before { color: var(--text-muted); }
    .compare__after { color: var(--text); }
    .compare__tag { font-size: var(--font-label); font-weight: var(--weight-semibold); color: var(--text-muted); }
    .compare__after .compare__tag { color: var(--success); }

    /* ---- tenant side ---- */
    .tenant { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: clamp(var(--space-6), 5vw, 3.5rem); align-items: start; }
    .tenant__list { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-3); }
    .tenant__list li {
      display: grid;
      gap: var(--space-0-5);
      padding: var(--space-3) var(--space-4);
      border-left: 3px solid var(--primary);
      border-radius: 0 12px 12px 0;
      background: var(--card-bg);
    }
    .tenant__list strong { font-size: var(--text-base); }
    .tenant__list span { font-size: var(--text-md); color: var(--text-muted); }

    /* ---- questions ---- */
    .faq { display: grid; gap: var(--space-2); max-width: 52rem; }
    .faq__item { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--card-bg); padding: var(--space-3) var(--space-4); }
    .faq__item summary { cursor: pointer; font-weight: var(--weight-semibold); }
    .faq__item p { margin: var(--space-2) 0 0; color: var(--text-muted); font-size: var(--text-md); }

    .feature__n { font-size: var(--font-label); font-weight: var(--weight-semibold); color: var(--primary); }

    /* ---- steps ---- */
    .steps {
      list-style: none; margin: 0; padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
      gap: var(--space-4);
      counter-reset: step;
    }

    .step { display: grid; gap: var(--space-1-5); align-content: start; }

    .step__n {
      display: grid; place-items: center;
      width: 2rem; height: 2rem;
      border-radius: 999px;
      background: var(--primary); color: var(--on-accent);
      font-weight: var(--weight-bold); font-size: var(--text-md);
    }

    .step h3 { margin: 0; font-size: var(--text-base); }
    .step p { margin: 0; font-size: var(--text-md); color: var(--text-muted); }

    /* ---- cta ---- */
    .cta {
      margin-inline: var(--gutter);
      padding: clamp(var(--space-8), 5vw, 3rem);
      border-radius: 22px;
      color: #fff;
      background:
        linear-gradient(135deg, rgba(33, 43, 38, 0.86), rgba(33, 43, 38, 0.72)),
        url('${UNSPLASH}/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1400&q=70') center/cover;
    }

    .cta__copy { display: grid; gap: var(--space-3); max-width: 46ch; }
    .cta h2 { margin: 0; font-size: clamp(1.5rem, 3.4vw, 2.3rem); letter-spacing: -0.02em; }
    .cta p { margin: 0; color: rgba(255, 255, 255, 0.85); }

    /* ---- footer ---- */
    .foot {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--space-4); flex-wrap: wrap;
      padding: var(--space-6) var(--gutter) var(--space-8);
      border-top: 1px solid var(--border);
      font-size: var(--text-sm);
    }

    .foot p { margin: 0; }

    @media (max-width: 900px) {
      .hero, .tenant { grid-template-columns: minmax(0, 1fr); }
      .compare__row { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
      .card--float { position: static; width: auto; margin-top: var(--space-4); }
      .hero__photo { height: clamp(14rem, 44vw, 20rem); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandingPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly session = inject(AuthSessionService);

  /** In-page jump without leaving the route (a bare #fragment link would resolve against <base href>). */
  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Sized at the CDN so a hero does not ship a 4MB original. */
  img(id: string, width: number): string {
    return `${UNSPLASH}/${id}?auto=format&fit=crop&w=${width}&q=70`;
  }

  readonly bars = [
    { label: 'Apr', value: 52 }, { label: 'May', value: 64 }, { label: 'Jun', value: 49 },
    { label: 'Jul', value: 78 }, { label: 'Aug', value: 71 }, { label: 'Sep', value: 96 }
  ];

  /** What changes, stated as facts about the product rather than invented customer numbers. */
  readonly stats = [
    { value: '1 click', label: 'Bills every room for the month' },
    { value: '0 shillings', label: 'Held by us — rent lands in your PayBill' },
    { value: '24/7', label: 'Tenants can check their own balance' },
    { value: 'Every building', label: 'On one screen, or one at a time' }
  ];

  readonly compare = [
    {
      topic: 'Sending bills',
      before: 'Working out rent, water and garbage for each room in a notebook, then texting forty tenants one by one.',
      after: 'Bill the whole building for the month at once — rent, utilities and meter readings included — and every tenant sees their bill.'
    },
    {
      topic: 'Getting paid',
      before: 'Tenants pay the PayBill with the wrong account number, and you match M-Pesa messages to rooms by hand.',
      after: 'Tenants get an M-Pesa prompt on their phone. Each payment is matched to their room and month automatically.'
    },
    {
      topic: '"I already paid"',
      before: 'A screenshot on WhatsApp, a search through your statement, and an argument over which month it was for.',
      after: 'The tenant pastes their M-Pesa message into the app. It is read for you; you confirm it with one tap.'
    },
    {
      topic: 'Chasing arrears',
      before: 'Calling round the building to find out who is behind, then calling again next week.',
      after: 'One list of who owes what and for how long. Select the late ones and send a reminder to all of them at once.'
    },
    {
      topic: 'Repairs',
      before: 'A leaking tap reported in passing, forgotten, and raised again — angrily — a month later.',
      after: 'The tenant reports it in the app, you assign it to someone, and anything overdue is flagged until it is fixed.'
    }
  ];

  /** The month in the order it happens. */
  readonly features = [
    {
      title: 'Bill the month',
      body: 'Start the billing cycle for a building and every room gets its bill: rent, fixed charges and metered water or power from this month\'s readings. Waive or adjust any line, with a reason kept on record.',
      photo: 'photo-1554224155-6726b3ff858f',
      alt: 'Calculating monthly bills'
    },
    {
      title: 'Collect by M-Pesa',
      body: 'Connect your PayBill or till — one for the agency or one per building. Tenants pay from a prompt on their phone and the money goes straight to you.',
      photo: 'photo-1512941937669-90a1b58e7e9c',
      alt: 'Person paying on a phone'
    },
    {
      title: 'Confirm and receipt',
      body: 'Payments are matched to the right room and month. Cash, bank and "I already paid" reports wait in one queue for you to confirm. Tenants download their receipt.',
      photo: 'photo-1554995207-c18c203602cb',
      alt: 'Checking a payment record'
    },
    {
      title: 'Chase only who owes',
      body: 'The overdue list shows who is behind, by how much and for how long. Send reminders in bulk, mark payments as received, and see the month close on your dashboard.',
      photo: 'photo-1560448204-e02f11c3d0e2',
      alt: 'Apartment interior'
    }
  ];

  readonly tenantSide = [
    { title: 'This month\'s bill, itemised', body: 'Rent, water, garbage and any adjustment — so nobody has to ask what the total is made of.' },
    { title: 'Pay from their phone', body: 'An M-Pesa prompt for the full balance or part of it, or your PayBill details if they prefer to pay by hand.' },
    { title: 'Report a payment', body: 'Paid but not showing? They paste the M-Pesa message and you confirm it — no screenshots, no disputes.' },
    { title: 'Statements and receipts', body: 'Every month and every payment, downloadable as a PDF whenever they need proof.' },
    { title: 'Repairs, tracked', body: 'Report a problem, follow its progress, and see when it is done.' },
    { title: 'Their lease, signed in the app', body: 'Read it, sign it, and keep a copy — along with their deposit record and documents.' },
    { title: 'Who to call', body: 'The caretaker, the office and the emergency number for their building, one tap away.' }
  ];

  /** The real inventory, taken from the product's screens — nothing on the roadmap. */
  readonly capabilities = [
    {
      title: 'Rent and billing',
      body: 'The month, worked out for you.',
      items: [
        'A monthly billing cycle per building',
        'Rent per room, with balances carried forward',
        'Fixed and metered utilities, with meter readings feeding the bill',
        'Adjustments and waivers, each with a reason and who made it',
        'A per-room view of what was billed, paid and still owed'
      ]
    },
    {
      title: 'Payments and M-Pesa',
      body: 'Money in, matched, and on record.',
      items: [
        'Your own PayBill or till, for the agency or per building',
        'M-Pesa prompts (STK push) sent to the tenant\'s phone',
        'Paste an M-Pesa or bank message to fill in a payment',
        'Tenant-reported payments waiting for your confirmation',
        'Receipts and monthly statements as PDFs'
      ]
    },
    {
      title: 'Arrears and deposits',
      body: 'Who owes, and what you are holding.',
      items: [
        'Overdue list with days late and last reminder sent',
        'Bulk reminders to the tenants you select',
        'Deposits agreed, held, refunded or kept — per tenant',
        'Collection trends on your dashboard'
      ]
    },
    {
      title: 'Tenants and leases',
      body: 'From application to move-out, filed against the tenant.',
      items: [
        'Room applications, reviewed and approved',
        'Lease agreements from your own contract template, signed in the app',
        'Lease amendments with a full history',
        'Tenant documents and verification',
        'Move-in, move-out and every past tenant of a room'
      ]
    },
    {
      title: 'Buildings and repairs',
      body: 'The estate as it stands, and what needs fixing.',
      items: [
        'Buildings, floors and rooms, with vacancy at a glance',
        'Building contacts tenants can call',
        'Maintenance requests with urgency, assignment and overdue flags',
        'Each room\'s repair and tenancy history'
      ]
    },
    {
      title: 'Team and communication',
      body: 'Everyone in the loop, nobody in the wrong building.',
      items: [
        'Caretakers and staff limited to the buildings you give them',
        'A dashboard for the portfolio, or one building at a time',
        'In-app chat between your team and tenants',
        'Notices and reminders by SMS, WhatsApp, email or app notification'
      ]
    }
  ];

  readonly roles = [
    { title: 'You, the landlord', body: 'Every building, every shilling and every tenant — the whole portfolio, or one building at a time.', photo: 'photo-1560250097-0b93528c311a', alt: 'Landlord portrait' },
    { title: 'Caretakers', body: 'Their building only: tenants, meter readings and repairs. Nothing else to wade through, nothing else to see.', photo: 'photo-1507003211169-0a1dd7228f2d', alt: 'Caretaker portrait' },
    { title: 'Accountants', body: 'Bills, payments, arrears and deposits across the buildings they are given.', photo: 'photo-1573497019940-1c28c88b4f3e', alt: 'Accountant portrait' },
    { title: 'Tenants', body: 'Their bill, their payments, their lease and their repairs — and fewer reasons to call you.', photo: 'photo-1544005313-94ddf0286df2', alt: 'Tenant portrait' }
  ];

  readonly steps = [
    { title: 'Add your building', body: 'Name the floors and rooms and set each room\'s rent. The layout and numbering are generated for you.' },
    { title: 'Connect your PayBill', body: 'Add your M-Pesa PayBill or till so tenants can pay you directly.' },
    { title: 'Bring your tenants in', body: 'Record who lives where, send them their sign-in, and attach their lease.' },
    { title: 'Run your first month', body: 'Bill the building, let payments match themselves, and chase only the few who are behind.' }
  ];

  readonly faq = [
    {
      q: 'Does the rent pass through Unitwise?',
      a: 'No. Tenants pay into your own M-Pesa PayBill or till. Unitwise records and matches the payment; it never holds your money.'
    },
    {
      q: 'What if a tenant pays without the right account number?',
      a: 'They can report the payment from their phone by pasting the M-Pesa message, or you can record it yourself the same way. Either way it is matched to the right room and month.'
    },
    {
      q: 'My tenants are not good with technology. Will they manage?',
      a: 'Paying is the same M-Pesa prompt they already know. Everything else — their bill, receipts, repairs — is optional, and you can keep recording cash and bank payments for them.'
    },
    {
      q: 'Can I start with one building?',
      a: 'Yes. Most landlords start with one, run a month on it, and add the rest once they have seen it work.'
    },
    {
      q: 'Can my caretaker use it without seeing everything?',
      a: 'Yes. Give them access to one building and that is all they see — its tenants, readings and repairs, not your other properties or totals you have not shared.'
    },
    {
      q: 'What does it cost?',
      a: 'You start on a free trial. After that, plans are priced by the size of your portfolio, and you can see your plan, invoices and payments from your billing page at any time.'
    }
  ];
}
