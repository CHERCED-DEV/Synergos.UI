import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  TabsElementComponent,
  type TabChangeDetail,
  normalizeOrientation,
  normalizeTabs,
} from './tabs';

const TABS = JSON.stringify([
  { id: 'general', label: 'General', content: 'Resumen general.' },
  { label: 'Detalles', content: 'Más detalles.' },
  { id: 'avanzado', label: 'Avanzado', content: 'Opciones avanzadas.', disabled: true },
  { content: 'Sin etiqueta — descartado' },
]);

describe('TabsElementComponent', () => {
  let fixture: ComponentFixture<TabsElementComponent>;
  let component: TabsElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TabsElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render nothing with no tabs (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasTabs()).toBe(false);
    expect(component.tabs().length).toBe(0);
    expect(component.activeId()).toBe('');
    expect(component.orientation()).toBe('horizontal');
  });

  it('should normalize tabs and honor initialTab + config (render/config case)', async () => {
    fixture.componentRef.setInput('tabsJson', TABS);
    fixture.componentRef.setInput('initialTab', 'detalles');
    fixture.detectChanges();
    await fixture.whenStable();

    // 3 valid tabs survive normalization (the entry without a label is dropped),
    // the second one derives its id from the slugified label.
    expect(component.tabs().length).toBe(3);
    expect(component.tabs()[1].id).toBe('detalles');
    expect(component.tabs()[2].disabled).toBe(true);

    // initialTab selects the requested (enabled) tab.
    expect(component.activeId()).toBe('detalles');
    expect(component.activeIndex()).toBe(1);
    // Roving tabindex tracks the active tab.
    expect(component.focusedId()).toBe('detalles');
  });

  it('should select a tab and emit tabchange; disabled tabs never activate (interaction case)', async () => {
    fixture.componentRef.setInput('tabsJson', TABS);
    fixture.detectChanges();
    await fixture.whenStable();

    // Default selection is the first enabled tab.
    expect(component.activeId()).toBe('general');

    let emitted: TabChangeDetail | undefined;
    component.tabchange.subscribe((detail) => (emitted = detail));

    const detalles = component.tabs().find((tab) => tab.id === 'detalles')!;
    component.selectTab(detalles);
    expect(component.activeId()).toBe('detalles');
    expect(component.isActive(detalles)).toBe(true);
    expect(emitted).toEqual({ id: 'detalles', index: 1 });

    // A disabled tab must not become active nor re-emit.
    emitted = undefined;
    const avanzado = component.tabs().find((tab) => tab.id === 'avanzado')!;
    component.selectTab(avanzado);
    expect(component.activeId()).toBe('detalles');
    expect(emitted).toBeUndefined();
  });

  it('should be idempotent: re-selecting the active tab keeps state and emits once', async () => {
    fixture.componentRef.setInput('tabsJson', TABS);
    fixture.detectChanges();
    await fixture.whenStable();

    let count = 0;
    component.tabchange.subscribe(() => count++);

    const general = component.tabs().find((tab) => tab.id === 'general')!;
    component.selectTab(general); // already active — no change, no emit
    expect(count).toBe(0);
    expect(component.activeId()).toBe('general');

    const detalles = component.tabs().find((tab) => tab.id === 'detalles')!;
    component.selectTab(detalles);
    component.selectTab(detalles); // second time is a no-op
    expect(count).toBe(1);
    expect(component.activeId()).toBe('detalles');
  });
});

describe('tabs pure helpers', () => {
  it('normalizeTabs drops entries without a label and dedupes ids', () => {
    const tabs = normalizeTabs([
      { id: 'a', label: 'Uno' },
      { label: 'Uno' }, // slug collides with derived id "uno"
      { content: 'no label' },
      'no-objeto',
    ]);
    expect(tabs.length).toBe(2);
    expect(tabs[0].id).toBe('a');
    expect(tabs[1].id).toBe('uno');
    expect(tabs[0].panelId).toBe('syn-tabpanel-a');
  });

  it('normalizeOrientation falls back to horizontal for unknown values', () => {
    expect(normalizeOrientation('vertical')).toBe('vertical');
    expect(normalizeOrientation('diagonal')).toBe('horizontal');
    expect(normalizeOrientation(undefined)).toBe('horizontal');
  });
});
