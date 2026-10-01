import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CHART_BAR_SYNHOST } from '@synergos/contracts';
import { ChartBarElementComponent } from './chart-bar';

const DATA = JSON.stringify([
  { label: 'Enero', value: 120 },
  { label: 'Febrero', value: 240 },
  { label: 'Marzo', value: 60 },
]);

describe('ChartBarElementComponent', () => {
  let fixture: ComponentFixture<ChartBarElementComponent>;
  let component: ChartBarElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartBarElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartBarElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no bars (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.bars()).toEqual([]);
    expect(component.hasBars()).toBe(false);
  });

  it('should build proportional bars with formatted values from config (render + config case)', async () => {
    fixture.componentRef.setInput('chartTitle', 'Ventas');
    fixture.componentRef.setInput('dataJson', DATA);
    fixture.componentRef.setInput('valuePrefix', '$');
    fixture.detectChanges();
    await fixture.whenStable();

    const bars = component.bars();
    expect(bars.length).toBe(3);
    expect(component.title()).toBe('Ventas');
    // Tallest datum (240) is the chart max -> 100%; others scale against it.
    expect(bars[1].percent).toBe(100);
    expect(bars[0].percent).toBe(50);
    expect(bars[2].percent).toBe(25);
    expect(bars[1].displayValue).toContain('$');
    expect(bars[1].displayValue).toContain('240');
  });

  // D1: con `chartTitle` y el TEXTO `dataJson` —lo que mandaba la vista— el gráfico decía «No hay
  // datos para graficar». Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('grafica las barras del editor, con sus valores es-CO ya numéricos, con el config exacto de la vista del CMS', async () => {
    const { ejemplo } = CHART_BAR_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe(ejemplo.title);
    expect(component.orientation()).toBe(ejemplo.orientation);
    expect(component.bars().map((b) => b.label)).toEqual(ejemplo.data?.map((d) => d.label));
    expect(component.bars().map((b) => b.value)).toEqual(ejemplo.data?.map((d) => d.value));
  });

  it('should track the active bar on interaction (interaction case)', async () => {
    fixture.componentRef.setInput('dataJson', DATA);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isActive(1)).toBe(false);
    component.setActive(1);
    expect(component.isActive(1)).toBe(true);
    expect(component.isActive(0)).toBe(false);

    component.setActive(null);
    expect(component.activeIndex()).toBeNull();
  });

  it('should let direct inputs override config and stay stable across recompute (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"title":"Config","data":[{"label":"X","value":10}]}');
    fixture.componentRef.setInput('chartTitle', 'Input');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Input');

    const first = component.bars();
    fixture.detectChanges();
    await fixture.whenStable();
    const second = component.bars();

    // Same inputs -> structurally identical bars (deterministic ids + percents).
    expect(second).toEqual(first);
    expect(second[0].percent).toBe(100);
  });

  // ADR 0136 (CMS#191): la microcopia sale de la sección `ChartBar` que publica la página.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO, con el plural', async () => {
      fixture.componentRef.setInput('config', JSON.stringify(CHART_BAR_SYNHOST.ejemplo));
      fixture.detectChanges();
      await fixture.whenStable();

      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('.chart-bar')?.getAttribute('aria-label')).toBe('Afiliados nuevos por trimestre: 3 categorías.');
      expect(Array.from(raiz.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual(['Categoría', 'Valor']);
      expect(component.emptyLabel()).toBe('No hay datos para graficar.');
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', async () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: {
          culture: 'en-US',
          defaultCulture: 'es-CO',
          keys: { 'ChartBar.Summary.Other': '{title}: {count} categories.', 'ChartBar.Category': 'Category' },
        },
      };
      const otra = TestBed.createComponent(ChartBarElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(CHART_BAR_SYNHOST.ejemplo));
      otra.detectChanges();
      await otra.whenStable();

      const raiz = otra.nativeElement as HTMLElement;
      expect(raiz.querySelector('.chart-bar')?.getAttribute('aria-label')).toBe('Afiliados nuevos por trimestre: 3 categories.');
      expect(Array.from(raiz.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual(['Category', 'Valor']);
    });
  });
});
