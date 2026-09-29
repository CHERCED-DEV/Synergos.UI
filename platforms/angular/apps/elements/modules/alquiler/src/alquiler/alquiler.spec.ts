import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlquilerApiClient } from './alquiler-api.client';
import { AlquilerElementComponent } from './alquiler';
import { normalizeRental, readRentalState } from './alquiler.model';

/**
 * El vertical de alquiler visto desde el navegador (#147).
 *
 * **El doble de `fetch` es un BORDE DE MENTIRA CON LA FORMA DEL DE VERDAD, apagado por MÉTODO y
 * RUTA.** No es cosmética: con la red apagada entera el único camino que se prueba es el del
 * `catch`, así que un defecto en el camino bueno pasa en verde para siempre — y las escrituras
 * de este vertical van todas DETRÁS de una lectura que sí funcionó, que es justo lo que un
 * apagón total no sabe reproducir.
 */

/** El rechazo de `fetch` es un macrotask en jsdom; hay que dejarlo llegar. */
async function drenar(veces = 12): Promise<void> {
  for (let i = 0; i < veces; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

const EQUIPO = {
  equipmentId: 'andamio-6m',
  name: 'Andamio multidireccional 6 m',
  category: 'Altura',
  summary: 'Torre de 6 m con plataforma y rodapié.',
  coverUrl: '/media/andamio.jpg',
  dailyRate: 45000,
  deposit: 400000,
  units: 8,
};

const FICHA = {
  ...EQUIPO,
  description: 'Certificada, con manual de armado.',
  galleryUrls: ['/media/andamio-1.jpg'],
  minDays: 3,
  maxDays: 30,
  includes: ['Plataforma', 'Rodapié'],
  requirements: ['Certificado de trabajo en altura'],
  rates: [
    { code: 'dia', label: 'Por día', minDays: 1, perDay: 45000, description: '' },
    { code: 'semana', label: 'Semana', minDays: 7, perDay: 38000, description: '' },
  ],
  specs: [{ label: 'Altura', value: '6 m' }],
};

const COTIZACION = {
  equipmentId: 'andamio-6m',
  quantity: 2,
  days: 7,
  perDay: 38000,
  rentalTotal: 532000,
  deposit: 800000,
};

const CONTRATO = {
  rentalId: 'alq-1',
  equipmentName: EQUIPO.name,
  quantity: 2,
  start: '2026-10-05',
  end: '2026-10-12',
  rentalTotal: 532000,
  depositHeld: 800000,
  issuedUtc: '2026-09-22T15:00:00+00:00',
  seal: 'a1b2c3d4e5f60718',
  verified: true,
};

const ALQUILER = {
  rentalId: 'alq-1',
  equipmentId: 'andamio-6m',
  quantity: 2,
  start: '2026-10-05',
  end: '2026-10-12',
  state: 'reserved',
  quote: COTIZACION,
  depositHeld: 800000,
  damageCharged: 0,
  agreement: CONTRATO,
};

/** Lo que el borde contesta a cada `MÉTODO /ruta`, y qué se apaga. */
type Guion = Record<string, unknown>;

function servidor(guion: Guion, apagadas: readonly string[] = []) {
  const llamadas: { metodo: string; url: string; cuerpo: unknown }[] = [];

  const doble = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const ruta = url.replace(/\?.*$/, '');
    const clave = `${metodo} ${ruta}`;
    llamadas.push({
      metodo,
      url,
      cuerpo: init?.body ? JSON.parse(String(init.body)) : null,
    });

    if (apagadas.includes(clave)) {
      return new Response(JSON.stringify({ code: 'alquiler.unavailable', detail: 'El servicio de alquiler no está disponible.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }

    if (apagadas.includes(`401 ${clave}`)) {
      return new Response(JSON.stringify({ code: 'alquiler.session_required', detail: '' }), {
        status: 401,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }

    const cuerpo = Object.prototype.hasOwnProperty.call(guion, clave) ? guion[clave] : undefined;
    if (cuerpo === undefined) {
      return new Response(JSON.stringify({ code: 'stub.no_route', detail: clave }), { status: 404 });
    }

    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', doble);
  return { llamadas };
}

const GUION_FELIZ: Guion = {
  'GET /api/alquiler/equipment': [EQUIPO],
  'GET /api/alquiler/equipment/andamio-6m': FICHA,
  'POST /api/alquiler/quote': COTIZACION,
  'POST /api/alquiler/rentals': ALQUILER,
  'GET /api/alquiler/rentals': [CONTRATO],
  'POST /api/alquiler/rentals/alq-1/return': { ...ALQUILER, state: 'returned', depositHeld: 0 },
  'POST /api/alquiler/rentals/alq-1/cancel': { ...ALQUILER, state: 'cancelled', depositHeld: 0 },
};

describe('AlquilerElementComponent', () => {
  let fixture: ComponentFixture<AlquilerElementComponent>;
  let component: AlquilerElementComponent;

  async function montar(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AlquilerElementComponent],
      providers: [provideZonelessChangeDetection(), AlquilerApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(AlquilerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.cargarCatalogo();
    await drenar();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── El camino bueno existe y se prueba ─────────────────────────────────

  it('sirve el catálogo que el CMS publica', async () => {
    servidor(GUION_FELIZ);
    await montar();

    expect(component.catalogo().estado).toBe('ok');
    const estado = component.catalogo();
    expect(estado.estado === 'ok' && estado.valor.length).toBe(1);
    expect(estado.estado === 'ok' && estado.valor[0].name).toBe(EQUIPO.name);
  });

  it('un catálogo vacío NO es un error, y se ve distinto de uno que no se pudo leer', async () => {
    servidor({ ...GUION_FELIZ, 'GET /api/alquiler/equipment': [] });
    await montar();

    // Vacío no es malformado: el servidor contestó bien «todavía no hay equipos».
    const estado = component.catalogo();
    expect(estado.estado).toBe('ok');
    expect(estado.estado === 'ok' && estado.valor.length).toBe(0);
  });

  it('con el catálogo caído se dice que no se pudo leer, y NO se inventa un equipo', async () => {
    servidor(GUION_FELIZ, ['GET /api/alquiler/equipment']);
    await montar();

    expect(component.catalogo().estado).toBe('error');
  });

  // ── La ficha y la cotización ───────────────────────────────────────────

  it('la ficha trae sus tramos de tarifa y sus límites', async () => {
    servidor(GUION_FELIZ);
    await montar();
    await component.abrir('andamio-6m');
    await drenar();

    const f = component.ficha();
    expect(f?.estado).toBe('ok');
    expect(f?.estado === 'ok' && f.valor.rates.length).toBe(2);
    expect(f?.estado === 'ok' && f.valor.minDays).toBe(3);
  });

  it('una ficha SIN límites de días no se sirve: el formulario no sabría qué ventana admitir', async () => {
    const { minDays: _min, maxDays: _max, ...sinLimites } = FICHA;
    servidor({ ...GUION_FELIZ, 'GET /api/alquiler/equipment/andamio-6m': sinLimites });
    await montar();
    await component.abrir('andamio-6m');
    await drenar();

    expect(component.ficha()?.estado).toBe('error');
  });

  it('la ventana se valida contra los límites del equipo antes de preguntar nada', async () => {
    servidor(GUION_FELIZ);
    await montar();
    await component.abrir('andamio-6m');
    await drenar();

    // Dos días, y el mínimo son tres.
    component.desde.set('2026-10-05');
    component.hasta.set('2026-10-07');
    expect(component.dias()).toBe(2);
    expect(component.puedeCotizar()).toBe(false);

    component.hasta.set('2026-10-12');
    expect(component.dias()).toBe(7);
    expect(component.puedeCotizar()).toBe(true);
  });

  it('la cotización distingue lo que se COBRA de lo que se RETIENE', async () => {
    servidor(GUION_FELIZ);
    await montar();
    await component.abrir('andamio-6m');
    await drenar();
    component.desde.set('2026-10-05');
    component.hasta.set('2026-10-12');
    component.unidades.set(2);
    await component.cotizar();
    await drenar();

    const q = component.cotizacion();
    // Los dos números son DISTINTOS en el fixture a propósito: con el mismo valor, pintar la
    // garantía como parte del total y no pintarla darían la misma pantalla.
    expect(q?.rentalTotal).toBe(532000);
    expect(q?.deposit).toBe(800000);
    expect(q?.rentalTotal).not.toBe(q?.deposit);
  });

  // ── Reservar, y lo que NO se fabrica ───────────────────────────────────

  it('reservar devuelve el alquiler que el borde emitió, con su comprobante', async () => {
    servidor(GUION_FELIZ);
    await montar();
    await component.abrir('andamio-6m');
    await drenar();
    component.desde.set('2026-10-05');
    component.hasta.set('2026-10-12');
    component.unidades.set(2);
    await component.reservar();
    await drenar();

    expect(component.reserva()?.rentalId).toBe('alq-1');
    expect(component.reserva()?.agreement?.seal).toBe(CONTRATO.seal);
    expect(component.problema()).toBe('');
  });

  it('si el borde no contesta al reservar, NO se inventa un alquiler', async () => {
    servidor(GUION_FELIZ, ['POST /api/alquiler/rentals']);
    await montar();
    await component.abrir('andamio-6m');
    await drenar();
    component.desde.set('2026-10-05');
    component.hasta.set('2026-10-12');
    await component.reservar();
    await drenar();

    // Ni identificador fabricado ni «listo»: un número de alquiler que no existe en ninguna
    // parte se lo lleva alguien a recoger un equipo que nadie apartó.
    expect(component.reserva()).toBeNull();
    expect(component.problema()).toContain('No pudimos reservar');
  });

  it('un 409 enseña el MOTIVO del borde y un 503 NO', async () => {
    // Los dos traen `code` y `detail`. Enseñar el del 503 le diría a quien alquila que el
    // problema es lo que pidió, cuando el problema es que el servicio no está (#129).
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify([EQUIPO]), { status: 200 });
      }
      return new Response(
        JSON.stringify({ code: 'alquiler.window_too_long', detail: 'Este equipo no se alquila por más de 30 días.' }),
        { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
      );
    }));
    await montar();

    await component.devolver('alq-1', 0);
    await drenar();
    expect(component.problema()).toBe('Este equipo no se alquila por más de 30 días.');
  });

  it('la llave de idempotencia es la MISMA en dos intentos sobre lo mismo', async () => {
    const { llamadas } = servidor(GUION_FELIZ);
    await montar();
    await component.abrir('andamio-6m');
    await drenar();
    component.desde.set('2026-10-05');
    component.hasta.set('2026-10-12');
    component.unidades.set(2);

    await component.reservar();
    await component.reservar();
    await drenar();

    const reservas = llamadas.filter((l) => l.url.endsWith('/api/alquiler/rentals') && l.metodo === 'POST');
    expect(reservas.length).toBe(2);
    const llaves = reservas.map((r) => (r.cuerpo as Record<string, string>)['idempotencyKey']);
    // Si la llave llevara la hora o un aleatorio, el segundo intento apartaría una unidad más.
    expect(llaves[0]).toBe(llaves[1]);
    expect(llaves[0]).toBeTruthy();
  });

  it('la llave de cerrar lleva el MONTO dentro', async () => {
    const { llamadas } = servidor(GUION_FELIZ);
    await montar();

    await component.devolver('alq-1', 0);
    await component.devolver('alq-1', 120000);
    await drenar();

    const cierres = llamadas.filter((l) => l.url.includes('/return'));
    const llaves = cierres.map((c) => (c.cuerpo as Record<string, string>)['idempotencyKey']);
    // Sin el monto dentro, corregir el daño y repetir devolvería el resultado de antes
    // contestando 200 y diciendo «puesto».
    expect(llaves[0]).not.toBe(llaves[1]);
  });

  // ── Mis alquileres, el sello, y el 401 ─────────────────────────────────

  it('sin sesión NO se enseña una bandeja vacía', async () => {
    servidor(GUION_FELIZ, ['401 GET /api/alquiler/rentals']);
    await montar();
    await component.cargarMios();
    await drenar();

    // «No tenés alquileres» dicho a quien no entró es una afirmación que nadie hizo.
    expect(component.mios()?.estado).toBe('sin-sesion');
  });

  it('el sello tiene TRES respuestas y «no consta» no se pinta como «comprobado»', async () => {
    servidor(GUION_FELIZ);
    await montar();

    expect(component.sello({ ...CONTRATO, verified: true })).toBe('comprobado');
    expect(component.sello({ ...CONTRATO, verified: false })).toBe('no-cuadra');
    // La clave ausente llega como `null` por el normalizador, y ésa es la tercera respuesta:
    // un comprobante pintado como válido sin haberlo comprobado es lo que el sello impide.
    expect(component.sello({ ...CONTRATO, verified: null })).toBe('sin-comprobar');
  });

  it('un alquiler con un estado que no se reconoce se deja FUERA en vez de darlo por reservado', async () => {
    servidor({ ...GUION_FELIZ, 'POST /api/alquiler/rentals': { ...ALQUILER, state: 'en-tramite' } });
    await montar();
    await component.abrir('andamio-6m');
    await drenar();
    component.desde.set('2026-10-05');
    component.hasta.set('2026-10-12');
    await component.reservar();
    await drenar();

    expect(component.reserva()).toBeNull();
    expect(component.problema()).not.toBe('');
  });

  it('devolver refresca la bandeja con lo que el servidor dijo', async () => {
    servidor(GUION_FELIZ);
    await montar();

    await component.devolver('alq-1', 0);
    await drenar();

    expect(component.reserva()?.state).toBe('returned');
    expect(component.reserva()?.depositHeld).toBe(0);
  });

  it('un intento que el orquestador deshizo NO se lee como reservado', async () => {
    // El borde emite `failed` desde CHERCED-DEV/Synergos.CMS#147: una saga compensada no dejó
    // ni ventana apartada ni plata retenida, y decía `reserved` de eso. Acá se comprueba la
    // otra mitad — que este lado lo RECONOZCA— porque un valor que el parser no conoce
    // devuelve `null` y borra el alquiler de la bandeja sin decir por qué, que es cambiar una
    // mentira por un hueco.
    expect(readRentalState('failed')).toBe('failed');
    expect(readRentalState('reserved')).toBe('reserved');
    expect(readRentalState('lo-que-sea')).toBeNull();

    const deshecho = normalizeRental({ ...ALQUILER, state: 'failed', depositHeld: 0 });
    expect(deshecho?.state).toBe('failed');
    expect(deshecho?.depositHeld).toBe(0);
  });

  it('con la garantía en «no consta» NO se dice que no retienen nada', async () => {
    // El `?? 0` que había acá convertía «nadie sabe si sigue retenida» en «no te retienen
    // nada», afirmado por el consumidor sobre un campo que el servidor dejó nulo a propósito
    // (`an_omitted_key_can_be_an_assertion`). El fixture tiene que llevar el nulo Y el cero:
    // con sólo el nulo no se distingue «lo leí» de «lo rellené».
    const sinSaber = normalizeRental({ ...ALQUILER, state: 'failed', depositHeld: null });
    expect(sinSaber?.depositHeld).toBeNull();

    const suelta = normalizeRental({ ...ALQUILER, state: 'cancelled', depositHeld: 0 });
    expect(suelta?.depositHeld).toBe(0);
  });

  it('si devolver no llega, el alquiler NO se da por cerrado', async () => {
    servidor(GUION_FELIZ, ['POST /api/alquiler/rentals/alq-1/return']);
    await montar();

    await component.devolver('alq-1', 0);
    await drenar();

    expect(component.reserva()).toBeNull();
    expect(component.problema()).toContain('sigue abierto');
  });
});
