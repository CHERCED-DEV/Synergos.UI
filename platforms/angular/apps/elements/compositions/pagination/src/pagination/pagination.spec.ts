import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  PaginationElementComponent,
  type PaginationChangeDetail,
  buildPageRange,
  resolveTotalPages,
  toPositiveInt,
} from './pagination';

describe('PaginationElementComponent', () => {
  let fixture: ComponentFixture<PaginationElementComponent>;
  let component: PaginationElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginationElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginationElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render nothing when there are no pages (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasPages()).toBe(false);
    expect(component.totalPages()).toBe(0);
    expect(component.items().length).toBe(0);
    expect(component.currentPage()).toBe(0);
  });

  it('should derive pages from config and build an ellipsis range with hrefs (render/config case)', async () => {
    fixture.componentRef.setInput('totalItems', 100);
    fixture.componentRef.setInput('itemsPerPage', 10);
    fixture.componentRef.setInput('currentPage', 5);
    fixture.componentRef.setInput('urlTemplate', '/blog?page={page}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.totalPages()).toBe(10);
    expect(component.currentPage()).toBe(5);

    const pages = component.items().filter((item) => item.kind === 'page');
    const ellipses = component.items().filter((item) => item.kind === 'ellipsis');
    // Boundaries (1,10) + current ±1 (4,5,6) → ellipsis on both sides.
    expect(pages.some((page) => page.page === 1)).toBe(true);
    expect(pages.some((page) => page.page === 10)).toBe(true);
    expect(pages.some((page) => page.page === 5 && page.isCurrent)).toBe(true);
    expect(ellipses.length).toBe(2);

    const fifth = pages.find((page) => page.page === 5);
    expect(fifth?.href).toBe('/blog?page=5');
  });

  it('should navigate and emit pagechange when a page is selected (interaction case)', async () => {
    fixture.componentRef.setInput('totalPages', 8);
    fixture.componentRef.setInput('currentPage', 1);
    fixture.componentRef.setInput('urlTemplate', '/list?page={page}');
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: PaginationChangeDetail | undefined;
    component.pagechange.subscribe((detail) => (emitted = detail));

    component.goToPage(3);
    expect(component.currentPage()).toBe(3);
    expect(emitted?.page).toBe(3);
    expect(emitted?.totalPages).toBe(8);
    expect(emitted?.href).toBe('/list?page=3');

    component.next();
    expect(component.currentPage()).toBe(4);

    component.previous();
    expect(component.currentPage()).toBe(3);
  });

  it('should ignore re-selecting the current page and clamp out-of-range (idempotent/precedence)', async () => {
    fixture.componentRef.setInput('config', '{"totalPages":5,"currentPage":2}');
    fixture.componentRef.setInput('currentPage', 3);
    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit attribute wins over config.
    expect(component.currentPage()).toBe(3);

    let emissions = 0;
    component.pagechange.subscribe(() => (emissions += 1));

    component.goToPage(3); // same page → no-op
    expect(emissions).toBe(0);
    expect(component.currentPage()).toBe(3);

    component.goToPage(999); // clamps to last
    expect(component.currentPage()).toBe(5);
    expect(emissions).toBe(1);
  });
});

describe('pagination pure helpers', () => {
  it('toPositiveInt coerces strings and rejects junk', () => {
    expect(toPositiveInt('42')).toBe(42);
    expect(toPositiveInt(7.9)).toBe(7);
    expect(toPositiveInt('basura')).toBe(0);
    expect(toPositiveInt(-3)).toBe(0);
    expect(toPositiveInt(undefined)).toBe(0);
  });

  it('resolveTotalPages ceils items/pageSize and honors explicit override', () => {
    expect(resolveTotalPages(100, 10, 0)).toBe(10);
    expect(resolveTotalPages(95, 10, 0)).toBe(10);
    expect(resolveTotalPages(0, 10, 0)).toBe(0);
    expect(resolveTotalPages(100, 10, 3)).toBe(3);
  });

  it('buildPageRange inserts a single collapsed ellipsis per gap', () => {
    const range = buildPageRange(5, 10, 1, 1);
    expect(range[0]).toBe(1);
    expect(range[range.length - 1]).toBe(10);
    expect(range.filter((entry) => entry === 'ellipsis').length).toBe(2);
    // No two consecutive ellipses.
    for (let i = 1; i < range.length; i++) {
      expect(range[i] === 'ellipsis' && range[i - 1] === 'ellipsis').toBe(false);
    }
  });

  it('buildPageRange lists every page when the range is short', () => {
    expect(buildPageRange(2, 5, 1, 1)).toEqual([1, 2, 3, 4, 5]);
  });
});
