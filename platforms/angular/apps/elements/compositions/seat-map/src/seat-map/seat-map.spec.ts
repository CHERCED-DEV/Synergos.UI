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
});
