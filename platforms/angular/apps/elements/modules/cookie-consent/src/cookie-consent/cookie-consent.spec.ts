import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CookieConsentElementComponent,
  type CookieConsentDecision,
  normalizeCategories,
} from './cookie-consent';

const STORAGE_KEY = 'syn-cookie-consent';

const CATEGORIES = JSON.stringify([
  { id: 'necessary', label: 'Necesarias', essential: true },
  { id: 'analytics', label: 'Analíticas', enabled: false },
  { id: 'marketing', label: 'Marketing', enabled: false },
  { label: 'Sin id válido es ok' },
  { description: 'Sin label — descartada' },
]);

describe('CookieConsentElementComponent', () => {
  let fixture: ComponentFixture<CookieConsentElementComponent>;
  let component: CookieConsentElementComponent;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [CookieConsentElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CookieConsentElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create, show the banner and fall back to default categories (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.visible()).toBe(true);
    expect(component.storedDecision()).toBeNull();
    // No categories supplied → canonical defaults (necessary/analytics/marketing).
    expect(component.categories().length).toBe(3);
    expect(component.categories()[0].essential).toBe(true);
    expect(component.acceptLabel()).toBe('Aceptar todo');
  });

  it('should render configured labels and categories (render/config case)', async () => {
    fixture.componentRef.setInput('bannerText', 'Texto a medida');
    fixture.componentRef.setInput('acceptLabel', 'Sí, acepto');
    fixture.componentRef.setInput('policyLink', 'https://example.com/cookies');
    fixture.componentRef.setInput('categories', CATEGORIES);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.bannerText()).toBe('Texto a medida');
    expect(component.acceptLabel()).toBe('Sí, acepto');
    expect(component.hasPolicyLink()).toBe(true);
    // 4 valid categories: 3 with id+label + 1 with only a label; the no-label one drops.
    expect(component.categories().length).toBe(4);
  });

  it('should accept all, persist, emit and dismiss (interaction case)', async () => {
    fixture.componentRef.setInput('categories', CATEGORIES);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: CookieConsentDecision | undefined;
    component.cookieconsent.subscribe((decision) => (emitted = decision));

    component.acceptAll();

    expect(component.visible()).toBe(false);
    expect(emitted?.action).toBe('accept');
    expect(emitted?.categories['analytics']).toBe(true);
    expect(emitted?.categories['marketing']).toBe(true);

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.action).toBe('accept');
    expect(persisted.categories.analytics).toBe(true);
  });

  it('should hydrate a prior decision from storage and stay dismissed (idempotent case)', async () => {
    const prior: CookieConsentDecision = {
      action: 'reject',
      categories: { necessary: true, analytics: false, marketing: false },
      timestamp: '2026-06-27T00:00:00.000Z',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prior));

    const secondFixture = TestBed.createComponent(CookieConsentElementComponent);
    const second = secondFixture.componentInstance;
    secondFixture.detectChanges();
    await secondFixture.whenStable();

    expect(second.visible()).toBe(false);
    expect(second.storedDecision()?.action).toBe('reject');
    expect(second.storedDecision()?.categories['analytics']).toBe(false);
  });

  it('reject keeps only essentials; custom save honors toggles', async () => {
    fixture.componentRef.setInput('categories', CATEGORIES);
    fixture.detectChanges();
    await fixture.whenStable();

    component.rejectAll();
    expect(component.storedDecision()?.categories['necessary']).toBe(true);
    expect(component.storedDecision()?.categories['analytics']).toBe(false);

    // Re-open and grant analytics, then save a custom decision.
    component.toggleSettings();
    const analytics = component.categories().find((c) => c.id === 'analytics')!;
    component.toggleCategory(analytics, true);
    component.savePreferences();

    expect(component.storedDecision()?.action).toBe('custom');
    expect(component.storedDecision()?.categories['analytics']).toBe(true);
  });
});

describe('cookie-consent pure helpers', () => {
  it('normalizeCategories drops entries without a label and dedupes ids', () => {
    const categories = normalizeCategories([
      { id: 'A', label: 'Uno' },
      { id: 'a', label: 'Duplicado por id' },
      { description: 'sin label' },
      'no-objeto',
    ]);
    expect(categories.length).toBe(1);
    expect(categories[0].id).toBe('a');
  });

  it('normalizeCategories forces essential categories on', () => {
    const categories = normalizeCategories([{ id: 'x', label: 'X', essential: true, enabled: false }]);
    expect(categories[0].enabled).toBe(true);
  });
});
