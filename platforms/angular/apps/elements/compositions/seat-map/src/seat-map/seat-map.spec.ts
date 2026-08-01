import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeatMapElementComponent, type SeatSelection } from './seat-map';

const SAMPLE_SEATMAP = JSON.stringify({
  aisleAfterColumns: 3,
  rows: [
    {
      rowNumber: 12,
      seats: [
        { id: '12A', type: 'window', available: true, price: 45000 },
        { id: '12B', type: 'middle', available: true, price: 0 },
        { id: '12C', type: 'aisle', available: false, price: 0 },
        { id: '12D', type: 'aisle', available: true, price: 0 },
        { id: '12E', type: 'middle', available: true, price: 0 },
        { id: '12F', type: 'window', available: true, price: 45000 },
      ],
    },
    {
      rowNumber: 13,
      seats: [
        { id: '13A', type: 'extra-legroom', available: true, price: 90000 },
        { id: '13B', type: 'middle', available: true, price: 0 },
        { id: '13C', type: 'aisle', available: true, price: 0 },
      ],
    },
  ],
});

describe('SeatMapElementComponent', () => {
  let fixture: ComponentFixture<SeatMapElementComponent>;
  let component: SeatMapElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeatMapElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SeatMapElementComponent);
    component = fixture.componentInstance;
  });

  function seedWith(seatmap: string): void {
    fixture.componentRef.setInput('seatmap', seatmap);
    fixture.detectChanges();
  }

  it('should render the cabin rows and seats from the seatmap (render case)', () => {
    seedWith(SAMPLE_SEATMAP);

    expect(component).toBeTruthy();
    expect(component.hasRows()).toBe(true);
    expect(component.rows().length).toBe(2);
    expect(component.totalSeats()).toBe(9);
    // One occupied seat (12C) → 8 available.
    expect(component.availableSeats()).toBe(8);
    // Column letters are derived 1-based (A, B, C …).
    expect(component.rows()[0].seats[0].letter).toBe('A');
    expect(component.rows()[0].seats[5].letter).toBe('F');

    const grid: HTMLElement | null = fixture.nativeElement.querySelector('[role="grid"]');
    expect(grid).toBeTruthy();
    const seats = fixture.nativeElement.querySelectorAll('.seat-map__seat');
    expect(seats.length).toBe(9);
  });

  it('should toggle a seat and emit the selection (select case)', () => {
    seedWith(SAMPLE_SEATMAP);

    const emitted: SeatSelection[] = [];
    component.seatselect.subscribe((value) => emitted.push(value));

    const seat = component.rows()[0].seats[0]; // 12A, available
    component.toggleSeat(seat);

    expect(component.isSelected(seat)).toBe(true);
    expect(component.selected()).toEqual(['12A']);
    expect(component.selectedTotal()).toBe(45000);
    expect(emitted.at(-1)?.selected).toEqual(['12A']);

    // Toggling again deselects.
    component.toggleSeat(seat);
    expect(component.isSelected(seat)).toBe(false);
    expect(emitted.at(-1)?.selected).toEqual([]);
  });

  it('should never select an occupied seat (occupied-no-select case)', () => {
    seedWith(SAMPLE_SEATMAP);

    const emitted: SeatSelection[] = [];
    component.seatselect.subscribe((value) => emitted.push(value));

    const occupied = component.rows()[0].seats[2]; // 12C, available: false
    expect(occupied.available).toBe(false);
    expect(component.canSelect(occupied)).toBe(false);

    component.toggleSeat(occupied);

    expect(component.isSelected(occupied)).toBe(false);
    expect(component.selected()).toEqual([]);
    expect(emitted.length).toBe(0);
    expect(component.seatStateLabel(occupied)).toBe('ocupado');
  });

  it('should render a legend with all seat states (legend case)', () => {
    seedWith(SAMPLE_SEATMAP);

    const legend: HTMLElement | null = fixture.nativeElement.querySelector('.seat-map__legend');
    expect(legend).toBeTruthy();

    const swatches = legend!.querySelectorAll('.seat-map__legend-swatch');
    expect(swatches.length).toBe(5);

    const labels = Array.from(legend!.querySelectorAll('.seat-map__legend-label')).map((el) =>
      (el.textContent ?? '').trim(),
    );
    expect(labels).toEqual(['Ventana', 'Pasillo', 'Espacio extra', 'Ocupado', 'Seleccionado']);
  });

  // ── Clase de servicio (ADR 0127) ───────────────────────────────────────────

  const CABIN_WITH_CLASSES = JSON.stringify({
    aisleAfterColumns: 2,
    rows: [
      {
        rowNumber: 1,
        serviceClass: 'business',
        seats: [
          { id: '1A', type: 'window', available: true, price: 900000 },
          { id: '1B', type: 'aisle', available: true, price: 900000 },
        ],
      },
      {
        rowNumber: 2,
        serviceClass: 'business',
        seats: [
          { id: '2A', type: 'window', available: true, price: 900000 },
          { id: '2B', type: 'aisle', available: true, price: 900000 },
        ],
      },
      {
        rowNumber: 10,
        serviceClass: 'economy',
        seats: [
          { id: '10A', type: 'window', available: true, price: 0 },
          { id: '10B', type: 'aisle', available: true, price: 0 },
        ],
      },
    ],
  });

  function sectionLabels(): readonly string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.seat-map__section-label') as NodeListOf<HTMLElement>,
    ).map((el) => (el.textContent ?? '').trim());
  }

  it('abre una sección solo cuando la clase de servicio CAMBIA', () => {
    // Una cabina se lee por tramos contiguos: repetir el encabezado en cada fila
    // de ejecutiva sería ruido, y omitirlo del todo deja al pasajero sin saber
    // dónde termina.
    seedWith(CABIN_WITH_CLASSES);

    expect(sectionLabels()).toEqual(['Ejecutiva', 'Económica']);
  });

  it('sin clase de servicio NO emite un solo encabezado', () => {
    // La carga que ya emite `eventos` no la declara: el mapa tiene que verse
    // exactamente como antes de este cambio.
    seedWith(SAMPLE_SEATMAP);

    expect(sectionLabels()).toEqual([]);
    expect(component.rows().every((row) => row.serviceClass === null)).toBe(true);
  });

  it('una clase de servicio desconocida se rotula tal cual en vez de descartarse', () => {
    // El vocabulario lo pone el proveedor del mapa, no este bundle: una clase
    // nueva no puede exigir republicarlo.
    seedWith(
      JSON.stringify({
        rows: [
          {
            rowNumber: 1,
            serviceClass: 'turista-superior',
            seats: [{ id: '1A', type: 'window', available: true }],
          },
        ],
      }),
    );

    expect(sectionLabels()).toEqual(['turista-superior']);
  });

  // ── Categorías / rasgos (ADR 0127) ─────────────────────────────────────────

  it('el rasgo YA NO pisa la posición de la butaca', () => {
    // Era el defecto concreto: `type` mezclaba posición con confort, así que una
    // butaca de ventana con espacio extra dejaba de ser de ventana.
    seedWith(
      JSON.stringify({
        rows: [
          {
            rowNumber: 20,
            seats: [{ id: '20A', type: 'window', available: true, features: ['extra-legroom'] }],
          },
        ],
      }),
    );

    const seat = component.rows()[0].seats[0];
    expect(seat.type).toBe('window');
    expect(seat.features).toEqual(['extra-legroom']);
  });

  it('el legado `type: extra-legroom` se traduce a rasgo y conserva lo que hacía', () => {
    // Las cargas viejas siguen viéndose igual: posición al centro (no había
    // otra) y el acento de espacio extra puesto por el rasgo.
    seedWith(SAMPLE_SEATMAP);

    const legado = component.rows()[1].seats[0];
    expect(legado.id).toBe('13A');
    expect(legado.type).toBe('middle');
    expect(legado.features).toEqual(['extra-legroom']);
  });

  it('la fila de salida se distingue del espacio extra aunque coincidan', () => {
    // Casi siempre coinciden, pero una fila de salida conlleva requisitos
    // (edad mínima, nada en el piso) que "más espacio" no tiene.
    seedWith(
      JSON.stringify({
        rows: [
          {
            rowNumber: 12,
            seats: [
              { id: '12A', type: 'window', available: true, features: ['exit-row', 'extra-legroom'] },
            ],
          },
        ],
      }),
    );

    const boton: HTMLElement = fixture.nativeElement.querySelector('.seat-map__seat');
    expect(boton.classList).toContain('seat-map__seat--exit-row');
    expect(boton.classList).toContain('seat-map__seat--extra-legroom');
  });

  it('un rasgo desconocido se pinta con su propio texto', () => {
    seedWith(
      JSON.stringify({
        rows: [
          {
            rowNumber: 1,
            seats: [{ id: '1A', type: 'window', available: true, features: ['mascota-a-bordo'] }],
          },
        ],
      }),
    );

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.seat-map__legend-label') as NodeListOf<HTMLElement>,
    ).map((el) => (el.textContent ?? '').trim());
    expect(labels).toContain('mascota-a-bordo');
  });

  it('la leyenda solo explica los rasgos PRESENTES en este mapa', () => {
    // Un mapa sin filas de salida no debe explicar qué es una fila de salida.
    seedWith(CABIN_WITH_CLASSES);

    expect(component.presentFeatures()).toEqual([]);
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.seat-map__legend-label') as NodeListOf<HTMLElement>,
    ).map((el) => (el.textContent ?? '').trim());
    expect(labels).toEqual(['Ventana', 'Pasillo', 'Ocupado', 'Seleccionado']);
  });

  it('los rasgos se normalizan y no se repiten', () => {
    seedWith(
      JSON.stringify({
        rows: [
          {
            rowNumber: 1,
            seats: [
              {
                id: '1A',
                type: 'window',
                available: true,
                features: ['  EXIT-ROW ', 'exit-row', '', 42, 'bulkhead'],
              },
            ],
          },
        ],
      }),
    );

    expect(component.rows()[0].seats[0].features).toEqual(['exit-row', 'bulkhead']);
  });

  it('el aria del asiento nombra su clase y sus rasgos', () => {
    // Quien navega con lector de pantalla salta de botón en botón y no
    // necesariamente oyó el encabezado de la sección.
    seedWith(
      JSON.stringify({
        rows: [
          {
            rowNumber: 12,
            serviceClass: 'premium',
            seats: [{ id: '12A', type: 'window', available: true, features: ['exit-row'] }],
          },
        ],
      }),
    );

    const boton: HTMLElement = fixture.nativeElement.querySelector('.seat-map__seat');
    const aria = boton.getAttribute('aria-label') ?? '';
    expect(aria).toContain('Asiento 12A');
    expect(aria).toContain('Ventana');
    expect(aria).toContain('Premium');
    expect(aria).toContain('Fila de salida');
  });
});
