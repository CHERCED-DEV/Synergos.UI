import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DetailShellComponent, type DetailMedia, type DetailSpec } from './detail-shell';

const MEDIA: readonly DetailMedia[] = [
  { url: 'https://cdn.example/a.jpg', alt: 'Frente' },
  { url: 'https://cdn.example/b.jpg', alt: 'Lado' },
];

const SPECS: readonly DetailSpec[] = [
  { label: 'Marca', value: 'Acme' },
  { label: 'Modelo', value: 'X-1' },
];

@Component({
  standalone: true,
  imports: [DetailShellComponent],
  template: `
    <ng-template #cta><button type="button" class="cta-buy">Comprar</button></ng-template>
    <syn-detail-shell
      [title]="'Título de prueba'"
      [eyebrow]="'Nuevo · Acme'"
      [media]="media()"
      [specs]="specs()"
      [ctaTemplate]="cta"
      [reviewsTemplate]="withReviews() ? reviewsRef : null"
      [qaTemplate]="withQa() ? qaRef : null"
      (back)="backCount = backCount + 1"
      (mediachange)="lastMediaIndex = $event"
    />
    <ng-template #reviewsRef><p class="slot-reviews">reviews-slot</p></ng-template>
    <ng-template #qaRef><p class="slot-qa">qa-slot</p></ng-template>
  `,
})
class HostComponent {
  readonly media = signal<readonly DetailMedia[]>([]);
  readonly specs = signal<readonly DetailSpec[]>([]);
  readonly withReviews = signal(false);
  readonly withQa = signal(false);
  backCount = 0;
  lastMediaIndex = -1;
}

describe(DetailShellComponent.name, () => {
  async function createHost() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty ───────────────────────────────────────────────────────────────────
  it('renders a media placeholder and no tabs when nothing is provided (empty case)', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.syn-detail__media-placeholder')).toBeTruthy();
    expect(element.querySelector('.syn-detail__tabs')).toBeNull();
    expect(element.querySelector('.syn-detail__specs')).toBeNull();
    expect(element.querySelector('.syn-detail__title')?.textContent).toContain('Título de prueba');
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('renders gallery, specs, sticky CTA and switches media via the strip (happy case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.media.set(MEDIA);
    host.specs.set(SPECS);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.cta-buy')).toBeTruthy();
    expect(element.querySelectorAll('.syn-detail__spec')).toHaveLength(2);
    expect(element.querySelector<HTMLImageElement>('.syn-detail__media-img')?.src).toContain(
      'a.jpg',
    );

    const thumbs = element.querySelectorAll<HTMLButtonElement>('.syn-detail__thumb');
    expect(thumbs).toHaveLength(2);
    thumbs[1].click();
    fixture.detectChanges();

    expect(host.lastMediaIndex).toBe(1);
    expect(element.querySelector<HTMLImageElement>('.syn-detail__media-img')?.src).toContain(
      'b.jpg',
    );

    element.querySelector<HTMLButtonElement>('.syn-detail__back')!.click();
    expect(host.backCount).toBe(1);
  });

  // ── filter ──────────────────────────────────────────────────────────────────
  it('only renders tabs for the slots actually provided (filter case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.withReviews.set(true);
    fixture.detectChanges();

    let element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.syn-detail__tab')).toHaveLength(1);
    expect(element.querySelector('.slot-reviews')).toBeTruthy();
    expect(element.querySelector('.slot-qa')).toBeNull();

    host.withQa.set(true);
    fixture.detectChanges();
    element = fixture.nativeElement;
    const tabs = element.querySelectorAll<HTMLButtonElement>('.syn-detail__tab');
    expect(tabs).toHaveLength(2);

    tabs[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.slot-qa')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.slot-reviews')).toBeNull();
  });

  // ── idempotent ─────────────────────────────────────────────────────────────
  it('re-selecting the active media or tab does not re-emit or change state (idempotent case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.media.set(MEDIA);
    host.withReviews.set(true);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const thumbs = element.querySelectorAll<HTMLButtonElement>('.syn-detail__thumb');

    thumbs[0].click(); // already active → no emit
    fixture.detectChanges();
    expect(host.lastMediaIndex).toBe(-1);

    thumbs[1].click();
    thumbs[1].click(); // second click is a no-op
    fixture.detectChanges();
    expect(host.lastMediaIndex).toBe(1);

    const tab = element.querySelector<HTMLButtonElement>('.syn-detail__tab')!;
    tab.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.slot-reviews')).toHaveLength(1);
  });
});
