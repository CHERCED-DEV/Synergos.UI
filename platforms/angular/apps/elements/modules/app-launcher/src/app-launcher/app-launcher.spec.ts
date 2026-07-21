import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ALL_FACET_VALUE,
  AppLauncherElementComponent,
  type AppSelectDetail,
} from './app-launcher';

const APPS = JSON.stringify([
  {
    id: 'hoteles',
    name: 'Hoteles',
    tagline: 'Motor de reservas de hospedaje',
    icon: 'H',
    status: 'live',
    industry: 'Viajes',
    persona: 'Viajero',
    capabilities: ['date-range', 'pax-selector', 'checkout'],
    url: '/hoteles',
    demoMode: 'deeplink',
  },
  {
    id: 'tienda',
    name: 'Tienda',
    tagline: 'Comercio electrónico tipo marketplace',
    icon: 'T',
    status: 'beta',
    industry: 'Retail',
    persona: 'Comprador',
    capabilities: ['catalog', 'cart', 'checkout'],
    url: '/tienda',
    demoMode: 'embed',
  },
  {
    id: 'eventos',
    name: 'Eventos',
    tagline: 'Gestión de eventos enterprise',
    icon: 'E',
    status: 'soon',
    industry: 'Viajes',
    persona: 'Organizador',
    capabilities: ['seat-map', 'checkout'],
    url: '/eventos',
    demoMode: 'deeplink',
  },
]);

describe('AppLauncherElementComponent', () => {
  let fixture: ComponentFixture<AppLauncherElementComponent>;
  let component: AppLauncherElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppLauncherElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppLauncherElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render all domain apps and derive facets (render case)', async () => {
    fixture.componentRef.setInput('apps', APPS);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.visibleApps().length).toBe(3);
    expect(component.visibleApps()[0].statusLabel).toBe('En vivo');
    expect(component.industryOptions().map((option) => option.value)).toEqual(['Retail', 'Viajes']);
    expect(component.hasFilters()).toBe(true);
  });

  it('should filter apps by an active facet (filter case)', async () => {
    fixture.componentRef.setInput('apps', APPS);
    fixture.detectChanges();
    await fixture.whenStable();

    component.industry.set('Retail');
    expect(component.visibleApps().map((app) => app.id)).toEqual(['tienda']);

    component.industry.set(ALL_FACET_VALUE);
    component.capability.set('seat-map');
    expect(component.visibleApps().map((app) => app.id)).toEqual(['eventos']);
  });

  it('should narrow apps by free-text search (search case)', async () => {
    fixture.componentRef.setInput('apps', APPS);
    fixture.detectChanges();
    await fixture.whenStable();

    component.query.set('marketplace');
    expect(component.visibleApps().map((app) => app.id)).toEqual(['tienda']);
    expect(component.resultLabel()).toBe('1 de 3 aplicaciones');

    component.query.set('no-match-term');
    expect(component.visibleApps()).toEqual([]);
  });

  it('should dispatch appselect with the app id (select case)', async () => {
    fixture.componentRef.setInput('apps', APPS);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    let detail: AppSelectDetail | null = null;
    host.addEventListener('appselect', (event) => {
      detail = (event as CustomEvent<AppSelectDetail>).detail;
    });

    component.onSelect(component.visibleApps()[0]);

    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('hoteles');
    expect(detail!.url).toBe('/hoteles');
    expect(detail!.demoMode).toBe('deeplink');
  });
});
