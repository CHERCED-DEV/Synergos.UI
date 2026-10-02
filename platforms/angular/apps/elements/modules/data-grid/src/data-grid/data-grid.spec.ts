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
    // es-CO: el punto es el separador de miles (antes salía en formato mexicano en un sitio es-CO).
    expect(precio?.value).toContain('4.200.000');
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

  // ── CMS#196, tanda D: las filas las arma el servidor ──────────────────────────────
  // Antes el editor escribía un `dataSource` que nadie consultaba, y la grilla decía «No hay
  // resultados que coincidan con los filtros» sin haber buscado nada.
  it('pinta las filas que manda el CMS con sus datos tal cual, sin formatearlos de nuevo', async () => {
    fixture.componentRef.setInput('config', {
      rows: [
        {
          id: 'f1',
          title: 'Asesoría express',
          href: '/booking/servicios/asesoria-express/',
          badge: 'Consultoría',
          specs: [{ label: 'Precio', value: '$ 180.000' }],
        },
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const card = component.visibleCards()[0];
    expect(card.title).toBe('Asesoría express');
    expect(card.ctaHref).toBe('/booking/servicios/asesoria-express/');
    expect(card.specs.map((s) => [s.label, s.value])).toEqual([['Precio', '$ 180.000']]);
    expect(component.resultLabel()).toBe('1 resultado');
  });

  it('con ?q y sin filas dice que no hay resultados PARA ESO, no que no hay nada', async () => {
    history.pushState({}, '', '?q=jazz');
    try {
      const conConsulta = TestBed.createComponent(DataGridElementComponent);
      conConsulta.componentRef.setInput('config', {});
      conConsulta.detectChanges();
      await conConsulta.whenStable();

      expect(conConsulta.componentInstance.emptyLabel()).toBe('No hay resultados para «jazz».');
    } finally {
      history.pushState({}, '', '/');
    }
  });

  it('sin filas dice que no hay nada publicado, no que un filtro no coincide', async () => {
    fixture.componentRef.setInput('config', {});
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.visibleCards()).toEqual([]);
    expect(component.emptyLabel()).toBe('Todavía no hay nada publicado aquí.');
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
