import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"separator":">","label":"Config nav"}');
    fixture.componentRef.setInput('separator', '/');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.separator()).toBe('/');
    expect(component.label()).toBe('Config nav');
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
