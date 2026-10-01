import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { APP_LAUNCHER_SYNHOST } from '@synergos/contracts';
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

  // ─── Título y subtítulo compuestos por el CMS ───────────────────────────────
  //
  // El Hub es la PORTADA del producto y pintaba su título de fábrica: el CMS mandaba
  // la clave `heading` y `sanitizeAppLauncherConfig` sólo conserva `title`, así que el
  // copy del editor se caía en silencio —el sanitizer reconstruye el objeto clave por
  // clave y lo que no lista desaparece sin error ni warning—.
  //
  // El config se pasa como STRING JSON a propósito: es la ruta real del mount (el
  // emitter fusiona todos los props en un solo atributo `config='{...}'`). Un test que
  // pase el objeto ya parseado no cubre producción.
  describe('título y subtítulo del CMS', () => {
    it('CONTROL: sin config pinta el título de fábrica y NINGÚN subtítulo', async () => {
      fixture.componentRef.setInput('apps', APPS);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.title()).toBe('Galería de aplicaciones');
      expect(component.subtitle()).toBe('');
      // El `@if` no debe dejar un <p> vacío: sin CMS el header queda como estaba.
      expect(fixture.nativeElement.querySelector('.app-launcher__subtitle')).toBeNull();
    });

    it('pinta el título y el subtítulo que compone el editor', async () => {
      fixture.componentRef.setInput('apps', APPS);
      fixture.componentRef.setInput(
        'config',
        JSON.stringify({ title: 'Explora las apps', subtitle: 'Un motor, mil productos' }),
      );
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.title()).toBe('Explora las apps');
      expect(component.subtitle()).toBe('Un motor, mil productos');
      expect(
        fixture.nativeElement.querySelector('.app-launcher__subtitle').textContent.trim(),
      ).toBe('Un motor, mil productos');
    });
  });

  // ─── ADR 0135/0136 (CMS#186): la funcionalidad del piloto ───────────────────
  describe('con el config EXACTO de la vista y el diccionario de la página', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('pinta el título, el subtítulo y las apps que autoró el editor', async () => {
      fixture.componentRef.setInput('config', JSON.stringify(APP_LAUNCHER_SYNHOST.ejemplo));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.title()).toBe('Explora las apps');
      expect(component.subtitle()).toBe('Un motor, muchos productos');
      expect(component.allApps().map((app) => app.name)).toEqual(['Tienda', 'Gobierno']);
      // «Trámites, Citas» llegó del CMS ya como lista.
      expect(component.allApps()[1].capabilities).toEqual(['Trámites', 'Citas']);
    });

    it('la microcopia sale de las claves que publicó la página, no del componente', async () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: {
          culture: 'en-US',
          defaultCulture: 'es-CO',
          keys: {
            'AppLauncher.Open': 'Open app',
            'AppLauncher.Count.Other': '{count} apps',
            'Common.States.ComingSoon': 'Coming soon',
          },
        },
      };
      const otra = TestBed.createComponent(AppLauncherElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(APP_LAUNCHER_SYNHOST.ejemplo));
      otra.detectChanges();
      await otra.whenStable();

      const c = otra.componentInstance;
      expect(c.ctaLabel()).toBe('Open app');
      expect(c.resultLabel()).toBe('2 apps');
      expect(c.allApps()[1].statusLabel).toBe('Coming soon');
      // Lo que la página no publica sale por el respaldo es-CO, nunca la clave cruda.
      expect(c.emptyLabel()).toBe('No hay aplicaciones que coincidan con los filtros.');
    });

    it('la microcopia ya NO entra por el config: la sanea el sanitizador', async () => {
      fixture.componentRef.setInput('config', JSON.stringify({ ...APP_LAUNCHER_SYNHOST.ejemplo, ctaLabel: 'Pisado' }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.ctaLabel()).toBe('Abrir app');
    });
  });
});
