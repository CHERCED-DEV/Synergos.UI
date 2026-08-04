import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InsightExplorerComponent } from './interface/insight-explorer';
import { InsightState } from './application/insight.state';
import { selectInsight, overrideItems } from './application/use-cases/select-insight';
import { DEFAULT_INSIGHTS } from './domain/insight.domain';
import { parseInsightItems } from './infrastructure/insight-explorer.adapter';

describe('InsightExplorerComponent', () => {
  let fixture: ComponentFixture<InsightExplorerComponent>;
  let component: InsightExplorerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsightExplorerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(InsightExplorerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /**
   * Los selectores del DOM de HOY, en un sitio (issue #13).
   *
   * `.insight-explorer__panel-title` dejo de existir cuando el panel paso a
   * <syn-heading>. Y el click sobre `.insight-explorer__card` dejo de
   * seleccionar por una razon mas sutil:
   *
   *   > `<syn-card>` pone su (click) en el <article> INTERNO, no en el host.
   *   > Un `.click()` sobre el host despacha el evento ahi y no baja: el
   *   > listener nunca se entera. La tarjeta parecia inerte.
   *
   * Por eso hay dos nodos y cada asercion mira el que le toca: se CLICA el
   * <article>, y la clase --active se comprueba en el HOST.
   */
  const panelTitulo = (): string | undefined =>
    fixture.nativeElement
      .querySelector('.insight-explorer__panel-header .syn-heading__title')
      ?.textContent?.trim();

  const clicarTarjeta = (i: number): void => {
    const article = fixture.nativeElement.querySelectorAll('.insight-explorer__card .syn-card')[i];
    if (!article) throw new Error(`no hay tarjeta en la posicion ${i}`);
    (article as HTMLElement).click();
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render all default insight items in sidebar', async () => {
    await fixture.whenStable();
    const cards = fixture.nativeElement.querySelectorAll('.insight-explorer__card');
    expect(cards.length).toBe(DEFAULT_INSIGHTS.length);
  });

  it('should show first item as active by default', async () => {
    await fixture.whenStable();
    const cards = fixture.nativeElement.querySelectorAll('.insight-explorer__card');
    expect(cards[0]?.classList).toContain('insight-explorer__card--active');
    expect(cards[1]?.classList).not.toContain('insight-explorer__card--active');
  });

  it('should display selected item details in panel', async () => {
    await fixture.whenStable();

    // El titulo del panel lo pinta <syn-heading>, no un .panel-title propio. Se
    // comprueba el TEXTO: el refactor cambio quien lo pinta, no el requisito de
    // que el panel muestre el item seleccionado.
    expect(panelTitulo()).toBe(DEFAULT_INSIGHTS[0].title);
    const desc = fixture.nativeElement.querySelector('.insight-explorer__panel-description');
    expect(desc?.textContent?.trim()).toBe(DEFAULT_INSIGHTS[0].description);
  });

  it('should select a different item on card click', async () => {
    await fixture.whenStable();

    clicarTarjeta(2);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedId()).toBe(DEFAULT_INSIGHTS[2].id);
    expect(panelTitulo()).toBe(DEFAULT_INSIGHTS[2].title);
  });

  it('should mark clicked card as active', async () => {
    await fixture.whenStable();

    clicarTarjeta(1);
    fixture.detectChanges();
    await fixture.whenStable();

    // La clase --active vive en el HOST <syn-card>, no en el <article> que
    // recibe el click. Son dos nodos distintos y hay que mirar el que toca.
    const cards = fixture.nativeElement.querySelectorAll('.insight-explorer__card');
    expect(cards[1]?.classList).toContain('insight-explorer__card--active');
    expect(cards[0]?.classList).not.toContain('insight-explorer__card--active');
  });

  it('should render metrics for active item', async () => {
    await fixture.whenStable();
    const metrics = fixture.nativeElement.querySelectorAll('.insight-explorer__metric');
    expect(metrics.length).toBe(DEFAULT_INSIGHTS[0].metrics.length);
  });

  it('should render feature list for active item', async () => {
    await fixture.whenStable();
    const features = fixture.nativeElement.querySelectorAll('.insight-explorer__feature');
    expect(features.length).toBe(DEFAULT_INSIGHTS[0].features.length);
  });

  it('should render title when provided', async () => {
    fixture.componentRef.setInput('title', '¿Qué incluye?');
    fixture.detectChanges();
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector(
      '.insight-explorer__header .syn-heading__title',
    );
    expect(title?.textContent?.trim()).toBe('¿Qué incluye?');
  });

  it('should not render header when title is empty', async () => {
    await fixture.whenStable();
    const header = fixture.nativeElement.querySelector('.insight-explorer__header');
    expect(header).toBeNull();
  });

  it('should apply dark theme modifier', async () => {
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.insight-explorer');
    expect(el?.className).toContain('sg-insight-explorer--dark');
  });

  it('should NOT set the id attribute when elementId is empty', async () => {
    // El caso negativo, que es el que destapa el defecto: con `[id]` —property
    // binding— poner `null` no quita el atributo, lo escribe con la cadena
    // "null". El positivo de abajo pasaba igual, porque poner un id sí
    // funcionaba; lo que no funcionaba era NO ponerlo (issue #11).
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.insight-explorer');
    expect(el?.getAttribute('id')).toBeNull();
  });

  it('should apply elementId as id attribute', async () => {
    fixture.componentRef.setInput('elementId', 'capabilities');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.insight-explorer');
    expect(el?.getAttribute('id')).toBe('capabilities');
  });

  it('should parse config attribute and apply values', async () => {
    fixture.componentRef.setInput('config', '{"title":"Features","theme":"dark","variant":"wide"}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Features');
    expect(component.theme()).toBe('dark');
    expect(component.variant()).toBe('wide');
  });
});

describe('InsightState', () => {
  let state: InsightState;

  beforeEach(() => {
    state = new InsightState();
  });

  it('should initialize with first item selected', () => {
    expect(state.selectedId()).toBe(DEFAULT_INSIGHTS[0].id);
    expect(state.selectedItem().id).toBe(DEFAULT_INSIGHTS[0].id);
  });

  it('should select a different item', () => {
    selectInsight(state, DEFAULT_INSIGHTS[2].id);
    expect(state.selectedId()).toBe(DEFAULT_INSIGHTS[2].id);
    expect(state.selectedItem().title).toBe(DEFAULT_INSIGHTS[2].title);
  });

  it('should ignore unknown ids', () => {
    selectInsight(state, 'nonexistent');
    expect(state.selectedId()).toBe(DEFAULT_INSIGHTS[0].id);
  });

  it('should override items and reset selection to first', () => {
    const custom = [
      { id: 'a', icon: '🔵', title: 'A', description: 'd', features: [], metrics: [], ctaLabel: '', ctaUrl: '' },
      { id: 'b', icon: '🟢', title: 'B', description: 'd', features: [], metrics: [], ctaLabel: '', ctaUrl: '' },
    ];
    overrideItems(state, custom);
    expect(state.items().length).toBe(2);
    expect(state.selectedId()).toBe('a');
  });

  it('should not override with empty array', () => {
    overrideItems(state, []);
    expect(state.items().length).toBe(DEFAULT_INSIGHTS.length);
  });
});

describe('parseInsightItems', () => {
  it('should return null for undefined input', () => {
    expect(parseInsightItems(undefined)).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(parseInsightItems('not-json')).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(parseInsightItems('[]')).toBeNull();
  });

  it('should parse valid JSON array', () => {
    const items = [{ id: 'x', icon: '🔴', title: 'X', description: 'd', features: [], metrics: [], ctaLabel: '', ctaUrl: '' }];
    const result = parseInsightItems(JSON.stringify(items));
    expect(result).not.toBeNull();
    expect(result![0].id).toBe('x');
  });
});
