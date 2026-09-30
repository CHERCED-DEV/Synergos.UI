import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BREADCRUMB_SYNHOST } from '@synergos/contracts';
import { BreadcrumbElementComponent, normalizeItems } from './breadcrumb';

const ITEMS = JSON.stringify([
  { label: 'Inicio', href: '/' },
  { label: 'Propiedades', href: '/propiedades' },
  { label: 'Loft Condesa' },
  '   ',
  { href: '/sin-label' },
]);

describe('BreadcrumbElementComponent', () => {
  let fixture: ComponentFixture<BreadcrumbElementComponent>;
  let component: BreadcrumbElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(BreadcrumbElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no items (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.items()).toEqual([]);
    expect(component.hasItems()).toBe(false);
    expect(component.structuredData()).toBe('');
  });

  it('should build a trail from config, dropping invalid entries (render/config case)', async () => {
    fixture.componentRef.setInput('items', ITEMS);
    fixture.detectChanges();
    await fixture.whenStable();

    const items = component.items();
    // 3 valid entries survive: blank string and label-less object are dropped.
    expect(items.length).toBe(3);
    expect(items[0].label).toBe('Inicio');
    expect(items[0].href).toBe('/');
    expect(items[0].position).toBe(1);
  });

  it('should flag the last item as current and clear its href (interaction/a11y case)', async () => {
    fixture.componentRef.setInput('items', ITEMS);
    fixture.detectChanges();
    await fixture.whenStable();

    const items = component.items();
    const last = items[items.length - 1];
    expect(last.label).toBe('Loft Condesa');
    expect(last.isCurrent).toBe(true);
    expect(last.href).toBe('');
    expect(items.slice(0, -1).every((item) => !item.isCurrent)).toBe(true);
  });

  // D1: con `itemsJson` —el TEXTO que mandaba la vista— este elemento hidrataba sin migas ni
  // JSON-LD. Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta los pasos que el editor autoró con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = BREADCRUMB_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    const pasos = ejemplo.items ?? [];
    expect(component.items().map((item) => item.label)).toEqual(pasos.map((paso) => paso.label));
    expect(component.items().slice(0, -1).map((item) => item.href)).toEqual(pasos.slice(0, -1).map((paso) => paso.href));
    expect(component.includeStructuredData()).toBe(ejemplo.includeStructuredData);
    expect(JSON.parse(component.structuredData()).itemListElement.length).toBe(pasos.length);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.breadcrumb__item').length).toBe(pasos.length);
  });

  // `separator` y `label` no los autora el editor en el CMS (ADR 0135): son atributo.
  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"includeStructuredData":false}');
    fixture.componentRef.setInput('includeStructuredData', 'true');
    fixture.componentRef.setInput('separator', '>');
    fixture.componentRef.setInput('label', 'Ruta');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.includeStructuredData()).toBe(true);
    expect(component.separator()).toBe('>');
    expect(component.label()).toBe('Ruta');
  });

  it('should emit BreadcrumbList JSON-LD only when structured data is enabled', async () => {
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('includeStructuredData', 'true');
    fixture.detectChanges();
    await fixture.whenStable();

    const ld = JSON.parse(component.structuredData());
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement.length).toBe(3);
    expect(ld.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Inicio',
      item: '/',
    });
    // current item has no `item` URL
    expect(ld.itemListElement[2].item).toBeUndefined();
  });
});

describe('breadcrumb pure helpers', () => {
  it('normalizeItems accepts strings and objects, drops label-less entries', () => {
    const items = normalizeItems([
      'Inicio',
      { label: 'Blog', href: '/blog' },
      { href: '/no-label' },
      42,
    ]);
    expect(items.length).toBe(2);
    expect(items[0].label).toBe('Inicio');
    expect(items[1].href).toBe('');
    expect(items[1].isCurrent).toBe(true);
  });

  it('normalizeItems returns empty for non-array input', () => {
    expect(normalizeItems(undefined)).toEqual([]);
    expect(normalizeItems('nope')).toEqual([]);
  });
});
