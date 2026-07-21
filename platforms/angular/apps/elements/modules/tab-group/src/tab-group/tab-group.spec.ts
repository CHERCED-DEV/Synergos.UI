import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  TabGroupElementComponent,
  type TabGroupChangeDetail,
  normalizeTabs,
  sanitizeTabGroupConfig,
} from './tab-group';

const TABS = JSON.stringify([
  { id: 'profile', label: 'Perfil', content: 'Datos de perfil' },
  { id: 'security', label: 'Seguridad', content: 'Contraseña y 2FA' },
  { id: 'billing', label: 'Facturación', content: 'Métodos de pago', disabled: true },
]);

describe('TabGroupElementComponent', () => {
  let fixture: ComponentFixture<TabGroupElementComponent>;
  let component: TabGroupElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabGroupElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TabGroupElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render an empty state with no tabs (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasTabs()).toBe(false);
    expect(component.parsedTabs().length).toBe(0);
    expect(component.activeId()).toBe('');
    const empty = fixture.nativeElement.querySelector('.tab-group__empty');
    expect(empty).toBeTruthy();
  });

  it('should read config payloads and default-activate the first enabled tab (render/config case)', async () => {
    fixture.componentRef.setInput(
      'config',
      `{"title":"Cuenta","tabs":${TABS},"theme":"dark","variant":"compact"}`,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Cuenta');
    expect(component.theme()).toBe('dark');
    expect(component.variant()).toBe('compact');
    expect(component.parsedTabs().length).toBe(3);
    // First enabled tab becomes active by default.
    expect(component.activeId()).toBe('profile');
    expect(component.activeIndex()).toBe(0);
    expect(fixture.nativeElement.querySelector('syn-tabs')).toBeTruthy();
  });

  it('should select a tab and emit tabchange with id/index/label (interaction case)', async () => {
    fixture.componentRef.setInput('tabs', TABS);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: TabGroupChangeDetail | undefined;
    component.tabchange.subscribe((detail) => (emitted = detail));

    component.selectTab('security');
    fixture.detectChanges();

    expect(component.activeId()).toBe('security');
    expect(component.activeIndex()).toBe(1);
    expect(emitted).toEqual({ activeId: 'security', index: 1, label: 'Seguridad' });

    // Disabled tabs and re-selecting the active tab do not emit.
    emitted = undefined;
    component.selectTab('billing');
    component.selectTab('security');
    expect(emitted).toBeUndefined();
    expect(component.activeId()).toBe('security');
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"theme":"dark","activeId":"security","title":"Desde config"}');
    fixture.componentRef.setInput('theme', 'light');
    fixture.componentRef.setInput('tabs', TABS);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.theme()).toBe('light');
    // Direct tabs input wins; configured activeId still resolves against it.
    expect(component.activeId()).toBe('security');
    expect(component.title()).toBe('Desde config');
  });
});

describe('tab-group pure helpers', () => {
  it('normalizeTabs filters malformed tabs and keeps disabled state', () => {
    expect(
      normalizeTabs([
        { id: 'profile', label: 'Profile', content: 'Body', disabled: true },
        { id: '', label: 'Broken' },
        { label: 'Missing id' },
        'no-objeto',
      ]),
    ).toEqual([{ id: 'profile', label: 'Profile', content: 'Body', disabled: true }]);
  });

  it('sanitizeTabGroupConfig trims strings and normalizes tabs', () => {
    const config = sanitizeTabGroupConfig({
      title: '  Account  ',
      activeId: ' profile ',
      tabs: [{ id: 'profile', label: 'Profile', content: 'Body' }],
    });

    expect(config.title).toBe('Account');
    expect(config.activeId).toBe('profile');
    expect(config.tabs).toHaveLength(1);
  });
});
