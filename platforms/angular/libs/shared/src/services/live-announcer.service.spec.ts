import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LiveAnnouncerService, documentLiveAnnouncer } from './live-announcer.service';

/**
 * El anunciador, medido en el DOM (#82).
 *
 * Un spec que busca `[aria-live]` después de anunciar la encuentra igual con la región creada
 * a tiempo que con la creada junto al mensaje — que es por lo que ningún spec vio las 119
 * regiones que nacen mudas. Acá se mira CUÁNDO existe la región, que sea la MISMA siempre y
 * que el texto pase por vacío antes de repetirse.
 */
const REGION = '[data-syn-live-announcer]';
const regiones = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(REGION));

describe(LiveAnnouncerService.name, () => {
  let service: LiveAnnouncerService;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    TestBed.configureTestingModule({ providers: [LiveAnnouncerService] });
    service = TestBed.inject(LiveAnnouncerService);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('la región existe ANTES del primer mensaje, vacía', () => {
    // El defecto que cierra: se creaba en el primer `announce()`, o sea junto con el mensaje.
    expect(regiones()).toHaveLength(1);
    expect(regiones()[0].textContent).toBe('');
    expect(regiones()[0].getAttribute('aria-live')).toBe('polite');
    expect(regiones()[0].getAttribute('aria-atomic')).toBe('true');
  });

  it('vacía, espera y pone; y a los `duration` ms limpia', () => {
    service.announce('Guardado');
    expect(regiones()[0].textContent).toBe('');

    vi.advanceTimersByTime(100);
    expect(regiones()[0].textContent).toBe('Guardado');

    vi.advanceTimersByTime(2900);
    expect(regiones()[0].textContent).toBe('');
  });

  it('el MISMO mensaje se vuelve a anunciar: el DOM pasa por vacío', () => {
    service.announce('Copiado');
    vi.advanceTimersByTime(100);
    const region = regiones()[0];
    expect(region.textContent).toBe('Copiado');

    service.announce('Copiado');
    // Sin este paso por vacío el texto no cambia y el lector calla (GOV-BL-A11Y-05).
    expect(region.textContent).toBe('');
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe('Copiado');
  });

  it('cambiar de cortesía cambia el atributo, NO recrea el nodo; y sin role', () => {
    const antes = regiones()[0];
    service.announce('Se acaba el tiempo', 'assertive');
    vi.advanceTimersByTime(100);

    expect(regiones()).toHaveLength(1);
    expect(regiones()[0]).toBe(antes);
    expect(antes.getAttribute('aria-live')).toBe('assertive');
    // `role="status"` + `aria-live="assertive"` era contradictorio.
    expect(antes.hasAttribute('role')).toBe(false);

    service.announce('Listo');
    expect(antes.getAttribute('aria-live')).toBe('polite');
  });

  it('dos anuncios seguidos: gana el segundo, y el primero no pisa después', () => {
    service.announce('Primero');
    vi.advanceTimersByTime(50);
    service.announce('Segundo');
    vi.advanceTimersByTime(100);
    expect(regiones()[0].textContent).toBe('Segundo');
    vi.advanceTimersByTime(60);
    expect(regiones()[0].textContent).toBe('Segundo');
  });

  it('UNA región por documento aunque la pidan varias aplicaciones', () => {
    // Cada custom element es su propia aplicación Angular: dos instancias del servicio.
    const otra = TestBed.runInInjectionContext(() => new LiveAnnouncerService());
    expect(regiones()).toHaveLength(1);

    otra.announce('Desde la otra app');
    vi.advanceTimersByTime(100);
    expect(regiones()[0].textContent).toBe('Desde la otra app');

    // Irse una no se lleva la región de la otra.
    otra.ngOnDestroy();
    expect(regiones()).toHaveLength(1);
  });

  it('la última aplicación en irse se lleva la región', () => {
    expect(regiones()).toHaveLength(1);
    TestBed.resetTestingModule();
    expect(regiones()).toHaveLength(0);
  });

  it('si alguien vació el <body>, el siguiente anuncio la vuelve a crear', () => {
    document.body.innerHTML = '';
    service.announce('Otra vez');
    vi.advanceTimersByTime(100);
    expect(regiones()).toHaveLength(1);
    expect(regiones()[0].textContent).toBe('Otra vez');
  });

  it('quien no tiene inyector alcanza la MISMA región', () => {
    const region = regiones()[0];
    documentLiveAnnouncer(document).announce('Agregado al carrito');
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe('Agregado al carrito');
  });

  describe('con un diálogo aria-modal abierto', () => {
    it('el modal VISIBLE se adueña de la región mientras dura el mensaje', () => {
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-owns', 'algo-suyo');
      document.body.appendChild(modal);

      service.announce('Agregado al carrito');
      vi.advanceTimersByTime(100);
      const id = regiones()[0].id;
      expect(id).not.toBe('');
      expect(modal.getAttribute('aria-owns')?.split(' ')).toEqual(['algo-suyo', id]);

      vi.advanceTimersByTime(2900);
      // Limpieza: se le devuelve lo suyo, sin la región.
      expect(modal.getAttribute('aria-owns')).toBe('algo-suyo');
    });

    it('un modal CERRADO que sigue en el DOM no: la escondería', () => {
      // Es la forma de `cart-summary`: el cajón vive en el DOM con aria-modal + aria-hidden.
      const cerrado = document.createElement('aside');
      cerrado.setAttribute('aria-modal', 'true');
      cerrado.setAttribute('aria-hidden', 'true');
      const oculto = document.createElement('div');
      oculto.setAttribute('aria-modal', 'true');
      oculto.style.display = 'none';
      document.body.append(cerrado, oculto);

      service.announce('Hola');
      vi.advanceTimersByTime(100);
      expect(cerrado.hasAttribute('aria-owns')).toBe(false);
      expect(oculto.hasAttribute('aria-owns')).toBe(false);
    });

    it('se cuelga del modal que está abierto AL ESCRIBIR, no del que había al llamar', () => {
      // Agregar al carrito anuncia y abre el cajón en el mismo turno: el cajón se hace
      // visible en el render siguiente.
      const cajon = document.createElement('aside');
      cajon.setAttribute('aria-modal', 'true');
      cajon.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cajon);

      service.announce('Agregado');
      cajon.removeAttribute('aria-hidden');
      vi.advanceTimersByTime(100);
      expect(cajon.getAttribute('aria-owns')).toBe(regiones()[0].id);
    });
  });

  it('en el servidor no toca el DOM', () => {
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      providers: [LiveAnnouncerService, { provide: PLATFORM_ID, useValue: 'server' }],
    });
    const enServidor = TestBed.inject(LiveAnnouncerService);
    enServidor.announce('Nada');
    vi.advanceTimersByTime(200);
    expect(regiones()).toHaveLength(0);
  });
});
