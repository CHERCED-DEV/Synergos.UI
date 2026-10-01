import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FilterPanelState } from '@synergos/shared';
import { DataGridElementComponent } from './data-grid';

const COLUMNS = JSON.stringify([
  { key: 'precio', label: 'Precio', type: 'currency' },
  { key: 'zona', label: 'Zona', type: 'text' },
  { key: 'recamaras', label: 'Recámaras', type: 'number' },
]);

const ROWS = JSON.stringify([
  { id: 'p1', title: 'Loft Condesa', zona: 'condesa', precio: 4200000, recamaras: 2 },
  { id: 'p2', title: 'Casa Polanco', zona: 'polanco', precio: 9800000, recamaras: 4 },
  { id: 'p3', title: 'Depto Roma', zona: 'roma', precio: 3100000, recamaras: 1 },
]);

const FILTERS = JSON.stringify([
  { key: 'precio', label: 'Precio máx.', type: 'range', min: 0, max: 10000000, step: 100000, prefix: '$' },
  {
    key: 'zona',
    label: 'Zona',
    type: 'select',
    options: [
      { value: 'condesa', label: 'Condesa' },
      { value: 'polanco', label: 'Polanco' },
      { value: 'roma', label: 'Roma' },
    ],
  },
]);

const SORT = JSON.stringify([
  { key: 'precio', label: 'Precio: menor a mayor', direction: 'asc' },
  { key: 'precio', label: 'Precio: mayor a menor', direction: 'desc' },
]);

describe('DataGridElementComponent', () => {
  let fixture: ComponentFixture<DataGridElementComponent>;
  let component: DataGridElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataGridElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DataGridElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no cards (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.visibleCards()).toEqual([]);
    expect(component.hasFilters()).toBe(false);
  });

  it('should build cards with formatted specs from config (happy case)', async () => {
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.detectChanges();
    await fixture.whenStable();

    const cards = component.visibleCards();
    expect(cards.length).toBe(3);
    const first = cards[0];
    expect(first.title).toBe('Loft Condesa');
    const precio = first.specs.find((spec) => spec.key === 'precio');
    expect(precio?.value).toContain('$');
    expect(precio?.value).toContain('4,200,000');
  });

  it('should filter cards by an active facet (filter case)', async () => {
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('filters', FILTERS);
    fixture.detectChanges();
    await fixture.whenStable();

    const state: FilterPanelState = { sort: '', values: { precio: 5000000, zona: ['condesa'] } };
    component.onFilterStateChange(state);

    const cards = component.visibleCards();
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe('p1');
  });

  it('should sort cards by the selected sort option', async () => {
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('sort', SORT);
    fixture.detectChanges();
    await fixture.whenStable();

    const descId = component.sortOptions()[1].id;
    component.onFilterStateChange({ sort: descId, values: {} });

    const cards = component.visibleCards();
    expect(cards.map((card) => card.id)).toEqual(['p2', 'p1', 'p3']);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"title":"Config title"}');
    fixture.componentRef.setInput('title', 'Input title');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Input title');
  });

  // ── #87, sospecha sin medir: `loading` es un input del HOST ─────────────────────
  // El contador está en el censo de `regiones-vivas` porque «vive y cambia al filtrar», con
  // un riesgo anotado: si un host lo pone en `loading` para recargar, la región pasa a nacer
  // con su mensaje y el lector calla. Se MIDE la identidad del nodo antes y después: una
  // región que se re-crea con el texto nuevo ya no es la que existía cuando el texto cambió.
  for (const conTitulo of [true, false]) {
    it(`al recargar (loading → false) el contador ${conTitulo ? 'con' : 'sin'} título es la MISMA región`, async () => {
      fixture.componentRef.setInput('columns', COLUMNS);
      fixture.componentRef.setInput('rows', ROWS);
      if (conTitulo) fixture.componentRef.setInput('title', 'Inmuebles');
      fixture.detectChanges();
      await fixture.whenStable();

      const contador = () =>
        fixture.nativeElement.querySelector('[aria-live="polite"].data-grid__count') as HTMLElement | null;
      const antes = contador();
      expect(antes, 'control: el contador existe antes de recargar').not.toBeNull();
      expect(antes!.textContent).toContain('3');

      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.componentRef.setInput('rows', JSON.stringify(JSON.parse(ROWS).slice(0, 2)));
      fixture.componentRef.setInput('loading', false);
      fixture.detectChanges();
      await fixture.whenStable();

      const despues = contador();
      expect(despues!.textContent).toContain('2');
      expect(despues, 'la región se re-creó con el texto nuevo: nace con su mensaje').toBe(antes);
    });
  }
});
