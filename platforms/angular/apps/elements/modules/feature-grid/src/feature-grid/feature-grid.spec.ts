import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  FeatureGridComponent,
  normalizeFeatureGridItems,
  sanitizeFeatureGridConfig,
} from './feature-grid';

describe('FeatureGridComponent', () => {
  let fixture: ComponentFixture<FeatureGridComponent>;
  let component: FeatureGridComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureGridComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('en el teléfono la rejilla se apila en una columna, sin importar cuántas pida (016, D-016-C14)', async () => {
    fixture.componentRef.setInput('items', JSON.stringify([{ heading: 'Uno', body: 'a' }, { heading: 'Dos', body: 'b' }, { heading: 'Tres', body: 'c' }]));
    fixture.componentRef.setInput('columns', 3);
    fixture.detectChanges();
    await fixture.whenStable();

    const grid = (fixture.nativeElement as HTMLElement).querySelector('.syn-grid-columns') as HTMLElement;
    expect(grid.className).toContain('syn-grid-columns--fixed');
    expect(grid.className).toContain('syn-grid-columns--stack-md');
  });

  it('should normalize feature items from JSON', async () => {
    fixture.componentRef.setInput(
      'items',
      '[{"heading":"Fast","body":"Loads quickly.","icon":"icon-speed"}]',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedItems()).toEqual([
      {
        heading: 'Fast',
        body: 'Loads quickly.',
        icon: 'icon-speed',
      },
    ]);
  });

  it('should filter empty feature items and accept headingText aliases', () => {
    expect(
      normalizeFeatureGridItems([
        { headingText: 'Fast', body: 'Loads quickly.' },
        { heading: 'Stable', icon: 'icon-check' },
        { body: '   ' },
      ]),
    ).toEqual([
      { heading: 'Fast', body: 'Loads quickly.', icon: '' },
      { heading: 'Stable', body: '', icon: 'icon-check' },
    ]);
  });

  it('should sanitize numeric columns and normalized items from config', () => {
    const config = sanitizeFeatureGridConfig({
      headingText: '  Benefits  ',
      columns: 4,
      items: [{ headingText: 'Fast', body: 'Loads quickly.' }],
    });

    expect(config.headingText).toBe('Benefits');
    expect(config.columns).toBe(4);
    expect(config.items).toEqual([{ heading: 'Fast', body: 'Loads quickly.', icon: '' }]);
  });
});
