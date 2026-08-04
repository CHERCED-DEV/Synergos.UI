import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeatureJourneyComponent } from './interface/feature-journey';
import { JOURNEY_STEPS } from './domain/journey.domain';
import { nextStep, prevStep, goToStep } from './application/use-cases/navigate-step';
import { JourneyState } from './application/journey.state';

describe('FeatureJourneyComponent', () => {
  let fixture: ComponentFixture<FeatureJourneyComponent>;
  let component: FeatureJourneyComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureJourneyComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureJourneyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /**
   * Los selectores del DOM de HOY, en un sitio.
   *
   * Las clases que buscaba este spec —`.feature-journey__panel-title`,
   * `.feature-journey__btn--next`— dejaron de emitirse cuando el panel y los
   * controles pasaron a <syn-heading> y <syn-button>. Los tests llevaban desde
   * entonces asertando contra un DOM que no existe, y nadie lo vio porque el
   * runner se fue con la purga de Nx (issue #13).
   *
   * Centralizarlos es lo que hace que el proximo refactor de la plantilla
   * cueste una linea y no seis.
   */
  const panelTitulo = (): string | undefined =>
    fixture.nativeElement
      .querySelector('.feature-journey__panel-content .syn-heading__title')
      ?.textContent?.trim();

  // Prev y next se distinguen por su variante, no por su posicion: `outline` es
  // el de volver y `solid` el de avanzar. Un nth-child se rompe el dia que
  // alguien meta algo entre medias — y el contador ya vive ahi.
  const botonAnterior = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.feature-journey__controls .syn-button--outline');
  const botonSiguiente = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.feature-journey__controls .syn-button--solid');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render all journey steps in nav', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const steps = fixture.nativeElement.querySelectorAll('.feature-journey__step');
    expect(steps.length).toBe(JOURNEY_STEPS.length);
  });

  it('should show first step as active by default', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const steps = fixture.nativeElement.querySelectorAll('.feature-journey__step');
    expect(steps[0]?.classList).toContain('feature-journey__step--active');
    expect(steps[1]?.classList).not.toContain('feature-journey__step--active');
  });

  it('should display active step content in panel', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    // El titulo del panel lo pinta <syn-heading>, no un .panel-title propio.
    // Se comprueba el TEXTO y no que el nodo exista: el refactor cambio quien
    // lo pinta, no el requisito de que el panel muestre el paso activo.
    expect(panelTitulo()).toBe(JOURNEY_STEPS[0].title);
    const desc = fixture.nativeElement.querySelector('.feature-journey__panel-description');
    expect(desc?.textContent?.trim()).toBe(JOURNEY_STEPS[0].description);
  });

  it('should advance to next step on next button click', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    botonSiguiente().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.activeIndex()).toBe(1);
    expect(panelTitulo()).toBe(JOURNEY_STEPS[1].title);
  });

  it('should disable prev button on first step', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(botonAnterior().disabled).toBe(true);
    expect(botonSiguiente().disabled).toBe(false);
  });

  it('should disable next button on last step', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    // Se navega por la API PUBLICA. El test viejo alcanzaba el estado privado
    // por su nombre mangled (`_FeatureJourneyComponent__state`), que depende de
    // como compile el bundler: bajo el build AOT salia undefined y el fallo era
    // un TypeError dentro de goToStep, no la asercion que el test queria hacer.
    component.goToStep(JOURNEY_STEPS.length - 1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isLast()).toBe(true);
    expect(botonSiguiente().disabled).toBe(true);
    expect(botonAnterior().disabled).toBe(false);
  });

  it('should navigate to a specific step on step button click', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const steps = fixture.nativeElement.querySelectorAll('.feature-journey__step');
    steps[2].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.activeIndex()).toBe(2);
    expect(steps[2]?.classList).toContain('feature-journey__step--active');
  });

  it('should mark previous steps as completed when advancing', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    botonSiguiente().click();
    fixture.detectChanges();
    botonSiguiente().click();
    fixture.detectChanges();
    await fixture.whenStable();

    const steps = fixture.nativeElement.querySelectorAll('.feature-journey__step');
    expect(steps[0]?.classList).toContain('feature-journey__step--completed');
    expect(steps[1]?.classList).toContain('feature-journey__step--completed');
    expect(steps[2]?.classList).toContain('feature-journey__step--active');
  });

  it('should show correct progress counter', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const counter = fixture.nativeElement.querySelector('.feature-journey__counter');
    expect(counter?.textContent?.trim()).toBe(`1 / ${JOURNEY_STEPS.length}`);
  });

  it('should render title when provided', async () => {
    fixture.componentRef.setInput('title', 'Cómo funciona Synergos');
    fixture.detectChanges();
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector(
      '.feature-journey__header .syn-heading__title',
    );
    expect(title?.textContent?.trim()).toBe('Cómo funciona Synergos');
  });

  it('should not render header when title is empty', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const header = fixture.nativeElement.querySelector('.feature-journey__header');
    expect(header).toBeNull();
  });

  it('should apply dark theme modifier class', async () => {
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.feature-journey');
    expect(el?.className).toContain('sg-feature-journey--dark');
  });

  it('should NOT set the id attribute when elementId is empty', async () => {
    // El caso negativo, que es el que destapa el defecto: con `[id]` —property
    // binding— poner `null` no quita el atributo, lo escribe con la cadena
    // "null". El positivo de abajo pasaba igual, porque poner un id sí
    // funcionaba; lo que no funcionaba era NO ponerlo (issue #11).
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.feature-journey');
    expect(el?.getAttribute('id')).toBeNull();
  });

  it('should apply elementId as id attribute', async () => {
    fixture.componentRef.setInput('elementId', 'how-it-works');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.feature-journey');
    expect(el?.getAttribute('id')).toBe('how-it-works');
  });

  it('should parse config and apply title and theme', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"title":"How It Works","theme":"dark","variant":"compact"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('How It Works');
    expect(component.theme()).toBe('dark');
    expect(component.variant()).toBe('compact');
  });
});

describe('JourneyState', () => {
  let state: JourneyState;

  beforeEach(() => {
    state = new JourneyState();
  });

  it('should initialize with first step active', () => {
    expect(state.activeIndex()).toBe(0);
    expect(state.activeStep().id).toBe(JOURNEY_STEPS[0].id);
  });

  it('should advance with nextStep', () => {
    nextStep(state);
    expect(state.activeIndex()).toBe(1);
  });

  it('should not advance beyond last step', () => {
    const last = JOURNEY_STEPS.length - 1;
    goToStep(state, last);
    nextStep(state);
    expect(state.activeIndex()).toBe(last);
  });

  it('should go back with prevStep', () => {
    nextStep(state);
    prevStep(state);
    expect(state.activeIndex()).toBe(0);
  });

  it('should not go before first step', () => {
    prevStep(state);
    expect(state.activeIndex()).toBe(0);
  });

  it('should jump to a specific step with goToStep', () => {
    goToStep(state, 3);
    expect(state.activeIndex()).toBe(3);
    expect(state.activeStep().id).toBe(JOURNEY_STEPS[3].id);
  });

  it('should ignore out-of-bounds goToStep calls', () => {
    goToStep(state, -1);
    expect(state.activeIndex()).toBe(0);
    goToStep(state, 999);
    expect(state.activeIndex()).toBe(0);
  });

  it('should report isFirst and isLast correctly', () => {
    expect(state.isFirst()).toBe(true);
    expect(state.isLast()).toBe(false);
    goToStep(state, JOURNEY_STEPS.length - 1);
    expect(state.isFirst()).toBe(false);
    expect(state.isLast()).toBe(true);
  });
});
