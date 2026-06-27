import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AccordionElementComponent,
  type AccordionToggleDetail,
  normalizeItems,
} from './accordion';

const ITEMS = JSON.stringify([
  { id: 'envios', title: 'Envíos y entregas', body: 'Despachamos en 24h.' },
  { id: 'pagos', title: 'Medios de pago', body: 'Tarjeta, PSE y efectivo.', open: true },
  { title: '', body: 'Sin título — descartado.' },
  { id: 'devoluciones', title: 'Devoluciones', content: 'Hasta 30 días.' },
]);

describe('AccordionElementComponent', () => {
  let fixture: ComponentFixture<AccordionElementComponent>;
  let component: AccordionElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccordionElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AccordionElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no items and render nothing expanded (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasItems()).toBe(false);
    expect(component.items().length).toBe(0);
    expect(component.expandedIds().length).toBe(0);
  });

  it('should normalize items from config and seed defaults from open flags (render/config case)', async () => {
    fixture.componentRef.setInput('config', { items: JSON.parse(ITEMS), headingLevel: 4 });
    fixture.detectChanges();
    await fixture.whenStable();

    // 3 valid items survive (the one without a title is dropped).
    expect(component.items().length).toBe(3);
    expect(component.hasItems()).toBe(true);
    expect(component.headingLevel()).toBe(4);

    // 'pagos' is open by default; single-expand keeps just one.
    expect(component.expandedIds()).toEqual(['pagos']);

    // Body falls back to `content` when `body` is absent.
    const devoluciones = component.items().find((item) => item.id === 'devoluciones');
    expect(devoluciones?.body).toBe('Hasta 30 días.');
  });

  it('should toggle a panel and emit itemtoggle, closing others in single-expand (interaction case)', async () => {
    fixture.componentRef.setInput('items', ITEMS);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: AccordionToggleDetail | undefined;
    component.itemtoggle.subscribe((detail) => (emitted = detail));

    const envios = component.items().find((item) => item.id === 'envios')!;
    component.toggle(envios);

    // Opening 'envios' replaces the default-open 'pagos' (single-expand).
    expect(component.isExpanded(envios)).toBe(true);
    expect(component.expandedIds()).toEqual(['envios']);
    expect(emitted?.id).toBe('envios');
    expect(emitted?.expanded).toBe(true);

    // Toggling the same item again collapses it.
    component.toggle(envios);
    expect(component.isExpanded(envios)).toBe(false);
    expect(component.expandedIds().length).toBe(0);
  });

  it('should keep multiple panels open and let direct input override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"allowMultiple":false}');
    fixture.componentRef.setInput('allowMultiple', true);
    fixture.componentRef.setInput('items', ITEMS);
    fixture.detectChanges();
    await fixture.whenStable();

    // Direct input wins over config.
    expect(component.allowMultiple()).toBe(true);

    const envios = component.items().find((item) => item.id === 'envios')!;
    const devoluciones = component.items().find((item) => item.id === 'devoluciones')!;
    component.toggle(envios);
    component.toggle(devoluciones);

    // Multi-expand keeps both plus the default-open 'pagos'.
    expect(component.expandedIds()).toEqual(['pagos', 'envios', 'devoluciones']);

    // Toggling twice is idempotent (back to the same set).
    component.toggle(envios);
    component.toggle(envios);
    expect(component.expandedIds()).toEqual(['pagos', 'devoluciones', 'envios']);
  });
});

describe('accordion pure helpers', () => {
  it('normalizeItems drops entries without a title and dedupes ids', () => {
    const items = normalizeItems([
      { id: 'a', title: 'Uno', body: 'x' },
      { id: 'a', title: 'Dup — re-id', body: 'y' },
      { title: '', body: 'sin título' },
      'no-objeto',
    ]);
    expect(items.length).toBe(2);
    expect(items[0].id).toBe('a');
    expect(items[1].id).toBe('accordion-item-1');
  });

  it('normalizeItems is empty for non-array input', () => {
    expect(normalizeItems(undefined).length).toBe(0);
    expect(normalizeItems('{}').length).toBe(0);
  });
});
