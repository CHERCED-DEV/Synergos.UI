import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PROGRESS_BAR_SYNHOST } from '@synergos/contracts';
import {
  ProgressBarElementComponent,
  clampNumber,
  computePercent,
  resolveMax,
} from './progress-bar';

describe('ProgressBarElementComponent', () => {
  let fixture: ComponentFixture<ProgressBarElementComponent>;
  let component: ProgressBarElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressBarElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProgressBarElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with safe defaults and render a progressbar (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.value()).toBe(0);
    expect(component.max()).toBe(100);
    expect(component.percent()).toBe(0);
    expect(component.indeterminate()).toBe(false);

    const track: HTMLElement | null = fixture.nativeElement.querySelector(
      '[role="progressbar"]',
    );
    expect(track).not.toBeNull();
    expect(track?.getAttribute('aria-valuenow')).toBe('0');
    expect(track?.getAttribute('aria-valuemax')).toBe('100');
  });

  it('should render a determinate fill clamped to max from config (render/config case)', () => {
    fixture.componentRef.setInput('value', '30');
    fixture.componentRef.setInput('max', '40');
    fixture.componentRef.setInput('label', 'Carga');
    fixture.componentRef.setInput('showValue', 'true');
    fixture.detectChanges();

    expect(component.value()).toBe(30);
    expect(component.max()).toBe(40);
    expect(component.percent()).toBe(75);
    expect(component.valueText()).toBe('75%');
    expect(component.fillWidth()).toBe('75%');

    const track: HTMLElement = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(track.getAttribute('aria-valuenow')).toBe('30');
    const label: HTMLElement = fixture.nativeElement.querySelector('.progress__label');
    expect(label.textContent).toContain('Carga');
  });

  it('should drop aria-valuenow and set aria-busy when indeterminate (interaction case)', () => {
    fixture.componentRef.setInput('indeterminate', 'true');
    fixture.componentRef.setInput('value', '50');
    fixture.detectChanges();

    expect(component.indeterminate()).toBe(true);
    expect(component.ariaValueNow()).toBeNull();
    expect(component.percent()).toBe(0);
    expect(component.fillWidth()).toBe('100%');

    const track: HTMLElement = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(track.getAttribute('aria-valuenow')).toBeNull();
    expect(track.getAttribute('aria-busy')).toBe('true');
  });

  // D1: con `valueNow`/`valueMax`/`ariaLabel` —lo que mandaba la vista— este elemento pintaba
  // «Progreso» al 0 %. Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta el avance que el editor autoró con el config exacto que emite la vista del CMS', () => {
    const { ejemplo } = PROGRESS_BAR_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();

    expect(component.value()).toBe(ejemplo.value);
    expect(component.max()).toBe(ejemplo.max);
    expect(component.accessibleLabel()).toBe(ejemplo.label);
    expect(component.percent()).toBe(Math.round(((ejemplo.value ?? 0) / (ejemplo.max ?? 100)) * 100));
    const track: HTMLElement = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(track.getAttribute('aria-valuenow')).toBe(String(ejemplo.value));
    expect(track.getAttribute('aria-label')).toBe(ejemplo.label);
  });

  // `tone` no lo autora el editor en el CMS (ADR 0135): es atributo.
  it('should let direct inputs override config deterministically (idempotent precedence)', () => {
    fixture.componentRef.setInput('config', '{"value":10,"max":100}');
    fixture.componentRef.setInput('value', '90');
    fixture.componentRef.setInput('tone', 'success');
    fixture.detectChanges();

    const first = { value: component.value(), percent: component.percent(), tone: component.tone() };

    // Re-applying identical inputs yields identical derived state.
    fixture.componentRef.setInput('value', '90');
    fixture.detectChanges();

    expect(component.value()).toBe(90);
    expect(component.percent()).toBe(90);
    expect(component.tone()).toBe('success');
    expect({ value: component.value(), percent: component.percent(), tone: component.tone() }).toEqual(
      first,
    );
  });
});

describe('progress-bar pure helpers', () => {
  it('clampNumber bounds values and rejects non-finite', () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-3, 0, 10)).toBe(0);
    expect(clampNumber(99, 0, 10)).toBe(10);
    expect(clampNumber(Number.NaN, 0, 10)).toBe(0);
  });

  it('resolveMax falls back to 100 for invalid ceilings', () => {
    expect(resolveMax(250)).toBe(250);
    expect(resolveMax(0)).toBe(100);
    expect(resolveMax(-5)).toBe(100);
    expect(resolveMax(undefined)).toBe(100);
  });

  it('computePercent returns a whole-percent fill', () => {
    expect(computePercent(50, 100)).toBe(50);
    expect(computePercent(1, 3)).toBe(33);
    expect(computePercent(200, 100)).toBe(100);
  });
});

/** El puente que publica la página (ADR 0136): sólo las claves que se pasan. */
function publicar(keys: Record<string, string>): void {
  (window as { synergos?: unknown }).synergos = { i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys } };
}

describe('progress-bar — microcopia del diccionario (ADR 0136, sección ProgressBar)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressBarElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    delete (window as { synergos?: unknown }).synergos;
  });

  it('el rótulo del editor gana; sin rótulo, el nombre es ProgressBar.Aria', async () => {
    publicar({ 'ProgressBar.Aria': 'Progress' });
    const conRotulo = TestBed.createComponent(ProgressBarElementComponent);
    conRotulo.componentRef.setInput('config', JSON.stringify(PROGRESS_BAR_SYNHOST.ejemplo));
    conRotulo.detectChanges();
    await conRotulo.whenStable();
    expect(conRotulo.componentInstance.accessibleLabel()).toBe(PROGRESS_BAR_SYNHOST.ejemplo.label);

    const sinRotulo = TestBed.createComponent(ProgressBarElementComponent);
    sinRotulo.detectChanges();
    await sinRotulo.whenStable();
    expect(sinRotulo.componentInstance.accessibleLabel()).toBe('Progress');
  });
});
