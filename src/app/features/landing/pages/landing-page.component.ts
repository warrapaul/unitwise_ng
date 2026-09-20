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
 * Copy and figures are placeholders for review.
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
          <a class="bar__link" [routerLink]="RoutePaths.availableRooms">Find a room</a>
          <a class="bar__link" [routerLink]="RoutePaths.shop">Shop</a>
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
            <h1>Collect rent on time.<br>Without scrolling through WhatsApp.</h1>
            <p class="lede">
              Every building, tenant, lease and shilling in one place — so your caretaker sees
              their block, your accountant sees the money, and you see all of it.
            </p>

            <div class="hero__actions">
              <a class="btn btn-primary btn-lg" [routerLink]="RoutePaths.signup">Start free</a>
              <a class="btn btn-secondary btn-lg" [routerLink]="RoutePaths.availableRooms">I'm looking to rent</a>
            </div>

            <ul class="ticks">
              <li>Free for your first building</li>
              <li>M-Pesa reconciliation built in</li>
              <li>Set up in an afternoon</li>
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

        <!-- SOCIAL PROOF -->
        <section class="proof">
          @for (stat of stats; track stat.label) {
            <div class="proof__item">
              <strong>{{ stat.value }}</strong>
              <span>{{ stat.label }}</span>
            </div>
          }
        </section>

        <!-- FEATURES -->
        <section class="section">
          <header class="section__head">
            <span class="eyebrow">How a month runs</span>
            <h2>From an empty room to rent in the bank</h2>
            <p class="section__lede">
              Four steps, in the order they happen. What sits behind each one is listed further
              down.
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
                  <h3>{{ feature.title }}</h3>
                  <p>{{ feature.body }}</p>
                </div>
              </article>
            }
          </div>
        </section>

        <!-- CAPABILITIES -->
        <section class="section">
          <header class="section__head">
            <span class="eyebrow">What you actually get</span>
            <h2>Every part of the month, already built</h2>
            <p class="section__lede">
              Not a roadmap. These are the screens in the product today, grouped the way the
              work happens.
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
            <span class="eyebrow">One system, four jobs</span>
            <h2>Everyone sees their part — and nothing else</h2>
            <p class="section__lede">
              Permissions follow the building, not the person. A caretaker on Block B cannot
              open Block C, and nobody has to remember to hide anything.
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

        <!-- TESTIMONIAL -->
        <section class="quote">
          <img class="quote__photo" [src]="img('photo-1522708323590-d24dbb6b0267', 700)" alt="Property manager at a desk" loading="lazy" width="700" height="500">
          <blockquote>
            <p>“Rent day used to be three days of phone calls. Now I open one screen and I know
              who has paid, who hasn't, and who to ring.”</p>
            <footer>
              <strong>Wanjiru M.</strong>
              <span>Manages 62 units, Nairobi · Illustrative</span>
            </footer>
          </blockquote>
        </section>

        <!-- HOW IT WORKS -->
        <section class="section">
          <header class="section__head">
            <span class="eyebrow">Getting started</span>
            <h2>Three steps, one afternoon</h2>
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

        <!-- CTA -->
        <section class="cta">
          <div class="cta__copy">
            <h2>Your next rent cycle could run itself.</h2>
            <p>Add one building, invite your caretaker, and see the difference by month end.</p>
            <div class="hero__actions">
              <a class="btn btn-primary btn-lg" [routerLink]="RoutePaths.signup">Create your account</a>
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
        <p class="muted">Placeholder marketing copy and sample figures — for layout review.</p>
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
      gap: 1rem;
      flex-wrap: wrap;
      padding: 1rem var(--gutter) 0;
    }

    .brand { display: flex; align-items: center; gap: 0.6rem; text-decoration: none; color: var(--text); }

    .brand__mark {
      display: grid; place-items: center;
      width: 2rem; height: 2rem;
      border-radius: 10px;
      background: var(--primary); color: #fff; font-weight: 800;
    }

    .brand__name { font-weight: 800; letter-spacing: -0.01em; }

    .bar__nav { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }

    .bar__link {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .bar__link:hover { color: var(--text); }

    /* ---- hero ---- */
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
      gap: clamp(1.5rem, 5vw, 3.5rem);
      align-items: center;
      padding: clamp(1rem, 4vw, 2.5rem) var(--gutter) 0;
    }

    .hero__copy { display: grid; gap: 1rem; align-content: start; }

    .eyebrow-pill {
      justify-self: start;
      padding: 0.3rem 0.7rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--text-muted);
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(2.1rem, 5.2vw, 3.6rem);
      line-height: 1.05;
      letter-spacing: -0.03em;
      font-weight: 800;
    }

    .lede { margin: 0; font-size: clamp(1rem, 1.6vw, 1.12rem); color: var(--text-muted); max-width: 46ch; }

    .hero__actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }

    .ticks { margin: 0.25rem 0 0; padding: 0; list-style: none; display: flex; gap: 1rem 1.4rem; flex-wrap: wrap; }

    .ticks li { position: relative; padding-left: 1.2rem; font-size: 0.85rem; color: var(--text-muted); }

    .ticks li::before {
      content: '✓';
      position: absolute; left: 0;
      color: var(--success); font-weight: 800;
    }

    /* ---- hero art ---- */
    .hero__art { position: relative; }

    .hero__photo {
      width: 100%;
      height: clamp(19rem, 40vw, 27rem);
      object-fit: cover;
      border-radius: 20px;
      display: block;
      box-shadow: var(--shadow-lg);
    }

    .card {
      border-radius: 16px;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      padding: 0.9rem 1rem;
      display: grid;
      gap: 0.5rem;
    }

    .card--float {
      position: absolute;
      left: clamp(-1rem, -2vw, 0rem);
      bottom: -1.75rem;
      width: min(19rem, 82%);
    }

    .card__eyebrow {
      margin: 0;
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.09em;
      text-transform: uppercase; color: var(--text-muted);
    }

    .card__figure { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }

    .card__foot { margin: 0; font-size: 0.72rem; color: var(--text-muted); }

    /*
     * The bars need a track with real height for a percentage to resolve
     * against — the previous version put height:% on a span whose parent had no
     * definite height, so every bar collapsed to a line.
     */
    .chart { display: grid; grid-auto-flow: column; gap: 0.4rem; align-items: end; }

    .chart__col { display: grid; gap: 0.4rem; justify-items: center; }

    .chart__track { display: flex; align-items: flex-end; height: 3.5rem; width: 100%; }

    .chart__fill {
      width: 100%;
      border-radius: 5px 5px 2px 2px;
      background: linear-gradient(180deg, var(--sage, #6e8c74), var(--primary));
      min-height: 0.3rem;
    }

    .chart__label { font-size: 0.62rem; color: var(--text-muted); }

    /* ---- proof strip ---- */
    .proof {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: 1rem;
      margin: 2rem var(--gutter) 0;
      padding: 1.25rem 1rem;
      border-block: 1px solid var(--border);
    }

    .proof__item { display: grid; justify-items: center; gap: 0.15rem; text-align: center; }
    .proof__item strong { font-size: clamp(1.3rem, 2.4vw, 1.8rem); letter-spacing: -0.02em; }
    .proof__item span { font-size: 0.78rem; color: var(--text-muted); }

    /* ---- sections ---- */
    .section { padding-inline: var(--gutter); display: grid; gap: 1.6rem; }

    .section--tint {
      background: var(--surface-2);
      padding-block: clamp(2rem, 5vw, 3.5rem);
    }

    .section__head { display: grid; gap: 0.4rem; max-width: 56ch; }

    .eyebrow {
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em;
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
      gap: 1rem;
    }

    .feature {
      display: grid;
      grid-template-rows: auto 1fr;
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      background: var(--surface);
    }

    .feature__photo { width: 100%; height: 9rem; object-fit: cover; display: block; }
    .feature__body { padding: 0.9rem 1rem 1.1rem; display: grid; gap: 0.4rem; align-content: start; }
    .feature h3 { margin: 0; font-size: 1.02rem; }
    .feature p { margin: 0; font-size: 0.88rem; color: var(--text-muted); }

    /* ---- capabilities ----
       Text-only and dense on purpose: the photo cards above sell the idea, this
       block answers "but does it do X" without making anyone scroll a brochure. */
    .caps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
      gap: 1rem;
      align-items: start;
    }

    .cap {
      display: grid;
      gap: 0.5rem;
      align-content: start;
      padding: 1.1rem 1.15rem 1.25rem;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--surface);
    }

    .cap h3 { margin: 0; font-size: 1rem; }

    .cap__lede {
      margin: 0;
      font-size: 0.86rem;
      color: var(--text-muted);
    }

    .cap__list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.4rem;
      font-size: 0.86rem;
    }

    .cap__list li {
      display: grid;
      grid-template-columns: 0.85rem 1fr;
      gap: 0.5rem;
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
      gap: 1rem;
    }

    .role {
      display: grid; gap: 0.4rem; align-content: start;
      padding: 1.1rem 1rem;
      border-radius: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
    }

    .role__avatar { width: 3rem; height: 3rem; border-radius: 999px; object-fit: cover; }
    .role h3 { margin: 0; font-size: 1rem; }
    .role p { margin: 0; font-size: 0.87rem; color: var(--text-muted); }

    /* ---- quote ---- */
    .quote {
      display: grid;
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: clamp(1rem, 4vw, 2.5rem);
      align-items: center;
      padding-inline: var(--gutter);
    }

    .quote__photo {
      width: 100%; height: clamp(14rem, 26vw, 20rem);
      object-fit: cover; border-radius: 20px; display: block;
    }

    .quote blockquote { margin: 0; display: grid; gap: 1rem; }

    .quote p {
      margin: 0;
      font-size: clamp(1.15rem, 2.3vw, 1.6rem);
      line-height: 1.35;
      letter-spacing: -0.015em;
    }

    .quote footer { display: grid; gap: 0.1rem; font-size: 0.85rem; }
    .quote footer span { color: var(--text-muted); }

    /* ---- steps ---- */
    .steps {
      list-style: none; margin: 0; padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
      gap: 1rem;
      counter-reset: step;
    }

    .step { display: grid; gap: 0.4rem; align-content: start; }

    .step__n {
      display: grid; place-items: center;
      width: 2rem; height: 2rem;
      border-radius: 999px;
      background: var(--primary); color: #fff;
      font-weight: 800; font-size: 0.9rem;
    }

    .step h3 { margin: 0; font-size: 1rem; }
    .step p { margin: 0; font-size: 0.88rem; color: var(--text-muted); }

    /* ---- cta ---- */
    .cta {
      margin-inline: var(--gutter);
      padding: clamp(1.75rem, 5vw, 3rem);
      border-radius: 22px;
      color: #fff;
      background:
        linear-gradient(135deg, rgba(33, 43, 38, 0.86), rgba(33, 43, 38, 0.72)),
        url('${UNSPLASH}/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1400&q=70') center/cover;
    }

    .cta__copy { display: grid; gap: 0.75rem; max-width: 46ch; }
    .cta h2 { margin: 0; font-size: clamp(1.5rem, 3.4vw, 2.3rem); letter-spacing: -0.02em; }
    .cta p { margin: 0; color: rgba(255, 255, 255, 0.85); }

    /* ---- footer ---- */
    .foot {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; flex-wrap: wrap;
      padding: 1.5rem var(--gutter) 2rem;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
    }

    .foot p { margin: 0; }

    @media (max-width: 900px) {
      .hero, .quote { grid-template-columns: minmax(0, 1fr); }
      .card--float { position: static; width: auto; margin-top: 0.9rem; }
      .hero__photo { height: clamp(14rem, 44vw, 20rem); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandingPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly session = inject(AuthSessionService);

  /** Sized at the CDN so a hero does not ship a 4MB original. */
  img(id: string, width: number): string {
    return `${UNSPLASH}/${id}?auto=format&fit=crop&w=${width}&q=70`;
  }

  readonly bars = [
    { label: 'Apr', value: 52 }, { label: 'May', value: 64 }, { label: 'Jun', value: 49 },
    { label: 'Jul', value: 78 }, { label: 'Aug', value: 71 }, { label: 'Sep', value: 96 }
  ];

  readonly stats = [
    { value: '2,400+', label: 'Units managed' },
    { value: '96%', label: 'Collected on time' },
    { value: '11 hrs', label: 'Saved each month' },
    { value: '4.8/5', label: 'Landlord rating' }
  ];

  /**
   * The month as a sequence, not a module list. These used to be the same four
   * headings as the capability groups below — the same ground covered twice,
   * once with photos and once with bullets — which read as padding rather than
   * as two answers to two different questions.
   */
  readonly features = [
    {
      title: 'Fill the room',
      body: 'Vacancies, applications and viewings in one queue — so the room that pays nothing this month is the one you are looking at.',
      photo: 'photo-1560448204-e02f11c3d0e2',
      alt: 'Apartment interior'
    },
    {
      title: 'Put it in writing',
      body: 'Verify the tenant, reserve the room and issue the lease in a single step, with their ID documents filed against it.',
      photo: 'photo-1554995207-c18c203602cb',
      alt: 'Signing a lease agreement'
    },
    {
      title: 'Take the money',
      body: 'Record a payment, match the M-Pesa code, and let arrears build themselves on the day you choose.',
      photo: 'photo-1554224155-6726b3ff858f',
      alt: 'Calculating rent payments'
    },
    {
      title: 'Tell people once',
      body: 'A notice, a reminder or an OTP goes by SMS, WhatsApp, email or push — whichever suits that message — and is logged against the tenant.',
      photo: 'photo-1512941937669-90a1b58e7e9c',
      alt: 'Person using a phone'
    }
  ];

  /**
   * The real inventory, taken from the navigation rather than invented — a
   * landing page that promises screens the product does not have is the fastest
   * way to lose the first week of a trial.
   */
  readonly capabilities = [
    {
      title: 'Buildings and rooms',
      body: 'The physical estate, modelled as it stands.',
      items: [
        'Agencies, buildings, floors and rooms',
        'Bulk floor and room generation on setup',
        'Per-room rent, deposit, due day and grace period',
        'Utilities and meters, fixed or metered, per room or per building',
        'Vacancy and maintenance status at a glance'
      ]
    },
    {
      title: 'Tenancies',
      body: 'From an enquiry to a signed lease, filed against the tenant.',
      items: [
        'Room applications with review and approval',
        'Lease agreements, activation and amendments',
        'Tenant documents with versioning and an archived history',
        'Verification snapshots kept for the audit trail',
        'Direct messages between tenant and agency'
      ]
    },
    {
      title: 'Rent and money',
      body: 'The part that decides whether the month worked.',
      items: [
        'Payments recorded against the right tenant and room',
        'M-Pesa reconciliation by transaction code',
        'Arrears generated automatically on the day you choose',
        'Adjustments and waivers, with a reason on every one',
        'Charge templates and meter readings for variable bills'
      ]
    },
    {
      title: 'People and access',
      body: 'Permissions follow the building, not the person.',
      items: [
        'Roles and permissions defined per agency',
        'Caretakers scoped to the blocks they look after',
        'User accounts, invitations and pending registrations',
        'Nobody sees an agency they were not granted'
      ]
    },
    {
      title: 'Getting hold of people',
      body: 'The right channel for the kind of message.',
      items: [
        'SMS, WhatsApp, email and push, chosen per message type',
        'Broadcast notices to a building or the whole agency',
        'In-app chat between staff and tenants',
        'Per-person notification preferences'
      ]
    },
    {
      title: 'Storefront',
      body: 'Sell to your tenants without a second system.',
      items: [
        'Products, variants, media and categories',
        'Orders, fulfilment and payment tracking',
        'Vouchers, discounts and customer groups',
        'Partial-payment policies for larger items'
      ]
    }
  ];

  readonly roles = [
    { title: 'Landlords', body: 'Own the agency, add buildings, and see the whole portfolio in one figure.', photo: 'photo-1560250097-0b93528c311a', alt: 'Landlord portrait' },
    { title: 'Caretakers', body: 'Scoped to the blocks they look after. Nothing else to wade through.', photo: 'photo-1507003211169-0a1dd7228f2d', alt: 'Caretaker portrait' },
    { title: 'Accountants', body: 'Rent, arrears and receipts across every building they are assigned to.', photo: 'photo-1573497019940-1c28c88b4f3e', alt: 'Accountant portrait' },
    { title: 'Tenants', body: 'Their room, their lease, their balance, and a direct line to the landlord.', photo: 'photo-1544005313-94ddf0286df2', alt: 'Tenant portrait' }
  ];

  readonly steps = [
    { title: 'Add your building', body: 'Name the floors and rooms once. Unitwise generates the layout and numbering for you.' },
    { title: 'Move your tenants in', body: 'Record who is in which room, attach their lease, and set the rent and due day.' },
    { title: 'Let the month run', body: 'Payments post against the right tenant, arrears surface on their own, reminders go out.' }
  ];
}
