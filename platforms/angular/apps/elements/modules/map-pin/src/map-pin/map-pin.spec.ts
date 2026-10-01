import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAP_PIN_SYNHOST } from '@synergos/contracts';
import {
  MapPinElementComponent,
  type MapPinSelectDetail,
  buildOsmEmbedUrl,
  clampZoom,
  normalizePins,
  parseCoordinate,
} from './map-pin';

const PINS = JSON.stringify([
  { lat: 4.6486, lng: -74.0639, label: 'Sede norte', description: 'Calle 100' },
  { lat: '4.5981', lng: '-74.0758', label: 'Sede centro', href: 'https://example.com' },
  { lat: 'no-es-num', lng: -74.1, label: 'Inválida — descartada' },
  { label: 'Sin coordenadas' },
]);

describe('MapPinElementComponent', () => {
  let fixture: ComponentFixture<MapPinElementComponent>;
  let component: MapPinElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapPinElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(MapPinElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render the default es-CO view with no pins (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasPins()).toBe(false);
    expect(component.pins().length).toBe(0);
    // Falls back to the Bogotá default center + default zoom.
    expect(component.centerLat()).toBeCloseTo(4.711, 3);
    expect(component.centerLng()).toBeCloseTo(-74.0721, 3);
    expect(component.zoomLevel()).toBe(13);
    expect(component.embedUrl()).toContain('openstreetmap.org/export/embed.html');
    expect(component.integration()).toBe('osm');
  });

  it('should normalize pins and clamp config from attributes (render/config case)', () => {
    fixture.componentRef.setInput('pinsJson', PINS);
    fixture.componentRef.setInput('centerLat', '4.65');
    fixture.componentRef.setInput('centerLng', '-74.06');
    fixture.componentRef.setInput('zoomLevel', '99'); // out of range → clamped to 19
    fixture.detectChanges();

    // 2 valid pins survive (bad lat dropped, missing coords dropped).
    expect(component.pins().length).toBe(2);
    expect(component.hasPins()).toBe(true);
    expect(component.pins()[1].lat).toBeCloseTo(4.5981, 4);
    expect(component.centerLat()).toBeCloseTo(4.65, 2);
    expect(component.zoomLevel()).toBe(19);
    expect(component.embedUrl()).toContain('marker=');
  });

  it('should select a pin, re-center, and emit pinselect (interaction case)', () => {
    fixture.componentRef.setInput('pinsJson', PINS);
    fixture.detectChanges();

    let emitted: MapPinSelectDetail | undefined;
    component.pinselect.subscribe((detail) => (emitted = detail));

    component.selectPin(1);

    expect(component.isActive(1)).toBe(true);
    expect(component.activePin()?.label).toBe('Sede centro');
    // Embed re-centers on the active pin.
    expect(component.viewLat()).toBeCloseTo(4.5981, 4);
    expect(component.viewLng()).toBeCloseTo(-74.0758, 4);
    expect(emitted?.index).toBe(1);
    expect(emitted?.pin.label).toBe('Sede centro');
  });

  it('should let direct inputs override config (idempotent precedence)', () => {
    // `integration` no la autora el CMS (ADR 0135): es atributo, no viaja en `config`.
    fixture.componentRef.setInput('config', '{"zoomLevel":5,"centerLat":1.1,"centerLng":2.2}');
    fixture.componentRef.setInput('integration', 'static');
    fixture.componentRef.setInput('zoomLevel', '8');
    fixture.detectChanges();

    // Explicit attribute wins over config; config fills the rest.
    expect(component.zoomLevel()).toBe(8);
    expect(component.integration()).toBe('static');
    expect(component.centerLat()).toBeCloseTo(1.1, 2);

    // Re-applying the same inputs yields the same resolved view (idempotent).
    const before = component.embedUrl();
    fixture.componentRef.setInput('zoomLevel', '8');
    fixture.detectChanges();
    expect(component.embedUrl()).toBe(before);
  });

  // D1: con el centro como texto y el TEXTO `pinsJson` —lo que mandaba la vista— el mapa salía en
  // el centro por defecto y sin pines. Éste alimenta el `config` EXACTO que emite hoy la vista.
  it('centra el mapa y pinta los pines del editor con el config exacto que emite la vista del CMS', () => {
    const { ejemplo } = MAP_PIN_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();

    expect(component.centerLat()).toBe(ejemplo.centerLat);
    expect(component.centerLng()).toBe(ejemplo.centerLng);
    expect(component.zoomLevel()).toBe(ejemplo.zoomLevel);
    expect(component.pins().map((p) => [p.lat, p.lng])).toEqual(ejemplo.pins?.map((p) => [p.lat, p.lng]));
    expect(component.pins().map((p) => p.label)).toEqual(ejemplo.pins?.map((p) => p.label));
    expect(component.pins().map((p) => p.description)).toEqual(ejemplo.pins?.map((p) => p.description));
  });

  // ADR 0136 (CMS#191): la microcopia sale de las secciones `Map` y `Common.Actions` que publica la
  // página.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO', () => {
      fixture.componentRef.setInput('config', JSON.stringify(MAP_PIN_SYNHOST.ejemplo));
      fixture.detectChanges();

      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('.map-pin')?.getAttribute('aria-label')).toBe('Mapa de ubicación');
      expect(raiz.querySelector('.map-pin__view-all')?.textContent?.trim()).toBe('Ver mapa ampliado');
      expect(component.frameTitle()).toBe('Mapa centrado en 4.7110, -74.0721');
      expect(component.moreAbout('Oficina Bogotá')).toBe('Más información sobre Oficina Bogotá');
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: {
          culture: 'en-US',
          defaultCulture: 'es-CO',
          keys: {
            'Map.Aria': 'Location map',
            'Map.CenteredOn': 'Map centered on {place}',
            'Map.Pin': 'Location {n}',
            'Common.Actions.SeeMore': 'See more',
          },
        },
      };
      const otra = TestBed.createComponent(MapPinElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(MAP_PIN_SYNHOST.ejemplo));
      otra.detectChanges();

      const c = otra.componentInstance;
      const raiz = otra.nativeElement as HTMLElement;
      expect(raiz.querySelector('.map-pin')?.getAttribute('aria-label')).toBe('Location map');
      c.selectPin(0);
      expect(c.frameTitle()).toBe('Map centered on Oficina Bogotá');
      expect(c.seeMoreLabel()).toBe('See more');
      expect(normalizePins([{ lat: 1, lng: 2 }])[0].label).toBe('Location 1');
      expect(raiz.querySelector('.map-pin__view-all')?.textContent?.trim()).toBe('Ver mapa ampliado');
    });
  });
});

describe('map-pin pure helpers', () => {
  it('parseCoordinate accepts numbers and numeric strings, rejects junk', () => {
    expect(parseCoordinate(4.7)).toBe(4.7);
    expect(parseCoordinate('-74.07')).toBeCloseTo(-74.07, 2);
    expect(parseCoordinate('basura')).toBeNull();
    expect(parseCoordinate(undefined)).toBeNull();
    expect(parseCoordinate(Number.NaN)).toBeNull();
  });

  it('clampZoom rounds and constrains to the OSM range', () => {
    expect(clampZoom(13, 13)).toBe(13);
    expect(clampZoom(99, 13)).toBe(19);
    expect(clampZoom(-4, 13)).toBe(1);
    expect(clampZoom('bad', 13)).toBe(13);
  });

  it('normalizePins drops entries without finite coordinates', () => {
    const pins = normalizePins([
      { lat: 4.7, lng: -74 },
      { lat: 'x', lng: -74 },
      { label: 'no coords' },
      'no-objeto',
    ]);
    expect(pins.length).toBe(1);
    expect(pins[0].label).toBe('Ubicación 1');
  });

  it('buildOsmEmbedUrl encodes a bbox and an optional marker', () => {
    const withMarker = buildOsmEmbedUrl(4.7, -74, 13, true);
    expect(withMarker).toContain('bbox=');
    expect(withMarker).toContain('marker=');

    const noMarker = buildOsmEmbedUrl(4.7, -74, 13, false);
    expect(noMarker).not.toContain('marker=');
  });
});
