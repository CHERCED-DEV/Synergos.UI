import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  definirCoordinador,
  type CoordinadorDelFlujo,
  type Enviar,
  type Peticion,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import { RESERVA_RELOJ, ReservaElementComponent, sanitizeReservaConfig } from './reserva';
import { leerPendiente } from './reserva.strategy';
import { asentar } from '../../../../../../tools/asentar';

/**
 * La reserva de un servicio vista desde el navegador (011-booking-reserva, ADR 0140).
 *
 * **La puerta es de mentira y con la forma de la de verdad**: el `<synergos-flujo>` real, con su
 * `enviar` sustituido por un guion por OPERACIÓN. Lo que se mira es lo que viaja (qué operaciones,
 * con qué llave y qué cuerpo) y lo que la pantalla afirma con lo que contestó el servidor.
 */

function drenar(veces = 10): Promise<void> {
  return asentar(veces);
}

const SERVICIO = {
  id: '51e3c7f8-96f8-4458-a650-5adec6126174',
  nombre: 'Masaje terapéutico · 60 min',
  duracionMinutos: 60,
  dias: ['Monday', 'Wednesday', 'Friday'],
  abre: '08:00',
  cierra: '18:00',
};

const CONFIG = {
  heading: 'Reserva tu cita',
  subheading: 'Elige el día y la hora',
  servicio: SERVICIO,
  enlaceAlternativo: '/contacto/',
  camino: 'puerta',
  zona: 'America/Bogota',
};

/** Lunes 19 de octubre de 2026, 07:00 en Bogotá (UTC−5). */
const AHORA = Date.parse('2026-10-19T12:00:00Z');
const MIERCOLES = '2026-10-21';
const VENTANA = { start: '2026-10-21T15:00:00Z', end: '2026-10-21T16:00:00Z' };
const TOTAL = { amount: 140000, currency: 'COP' };

function respuesta(estado: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'rs-1',
    flujo: 'reservas.servicio',
    numero: 'R-0001',
    estado,
    datos: { servicio: { kind: 'reservas.servicio', id: SERVICIO.id }, ventana: VENTANA, total: TOTAL },
    compensacionesPendientes: 0,
    error: null,
    deshaciendo: false,
    ...extra,
  };
}

const ok = (valor: unknown): ResultadoDelFlujo<unknown> => ({ ok: true, valor, estado: 200, correlacion: 'c-1' });

function no(code: string, status: number, transient = false, origen: 'servidor' | 'red' | 'forma' = 'servidor'): ResultadoDelFlujo<unknown> {
  return { ok: false, rechazo: { code, status, transient, detail: '', origen, extra: {} }, correlacion: 'c-1' };
}

type Respondedor = (p: Peticion) => ResultadoDelFlujo<unknown>;
type Guion = Partial<Record<'abrir' | 'cotizar' | 'cerrar' | 'consultar' | 'cancelar', Respondedor | Respondedor[]>>;

/** La puerta de mentira: contesta por operación (una lista se consume en orden) y anota lo que vio. */
function puerta(guion: Guion) {
  const vistas: Peticion[] = [];
  const operacion = (p: Peticion) => p.url.split('?')[0]?.split('/').pop() ?? '';
  const enviar: Enviar = (p) => {
    vistas.push(p);
    const r = guion[operacion(p) as keyof Guion];
    const responder = Array.isArray(r) ? r.shift() : r;
    return Promise.resolve(responder ? responder(p) : no('prueba.sin_guion', 500));
  };
  return {
    enviar,
    vistas,
    ops: () => vistas.map(operacion),
    de: (op: string) => vistas.filter((p) => operacion(p) === op),
  };
}

const COTIZA: Respondedor = () => ok({ flujo: 'reservas.servicio', datos: { servicio: { kind: 'reservas.servicio', id: SERVICIO.id }, ventana: VENTANA, total: TOTAL } });
const MIEMBRO = { member: { key: 'm-1', displayName: 'Ada Lovelace', email: 'ada@example.com', roles: [] } };

describe('<synergos-reserva>', () => {
  let fixture: ComponentFixture<ReservaElementComponent>;
  let component: ReservaElementComponent;

  beforeAll(() => definirCoordinador());

  afterEach(() => {
    document.querySelectorAll('synergos-flujo').forEach((flujo) => flujo.remove());
    delete (window as { synergos?: unknown }).synergos;
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    TestBed.resetTestingModule();
  });

  /** Monta el elemento como lo coloca el CMS: dentro de su `<synergos-flujo>`, con un miembro. */
  async function montar(
    config: Record<string, unknown> = CONFIG,
    opciones: { readonly guion?: ReturnType<typeof puerta>; readonly coordinador?: boolean; readonly bridge?: unknown } = {},
  ): Promise<void> {
    const bridge = 'bridge' in opciones ? opciones.bridge : MIEMBRO;
    if (bridge !== undefined) (window as { synergos?: unknown }).synergos = bridge;
    await TestBed.configureTestingModule({
      imports: [ReservaElementComponent],
      providers: [provideZonelessChangeDetection(), { provide: RESERVA_RELOJ, useValue: () => AHORA }],
    }).compileComponents();
    fixture = TestBed.createComponent(ReservaElementComponent);
    component = fixture.componentInstance;
    if (opciones.coordinador ?? true) {
      const flujo = document.createElement('synergos-flujo') as CoordinadorDelFlujo;
      flujo.setAttribute('flujo', 'reservas.servicio');
      flujo.enviar = (opciones.guion ?? puerta({})).enviar;
      document.body.appendChild(flujo);
      flujo.appendChild(fixture.nativeElement as HTMLElement);
    }
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await drenar();
    fixture.detectChanges();
  }

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const texto = (selector: string): string => host().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const aviso = (): string => texto('.sg-reserva__aviso');

  async function pintar(): Promise<void> {
    await drenar();
    fixture.detectChanges();
  }

  async function elegir(fecha = MIERCOLES, hora = '10:00'): Promise<void> {
    component.elegirDia({ target: { value: fecha } } as unknown as Event);
    component.elegirHora({ target: { value: hora } } as unknown as Event);
    await pintar();
  }

  // ── Elegir dentro del horario publicado ─────────────────────────────────────

  it('pinta el servicio de la página y ofrece sólo días y horas de su horario, sin marcar ninguna como libre ni llamar a nada', async () => {
    const guion = puerta({});
    await montar(CONFIG, { guion });

    expect(texto('.sg-reserva__servicio')).toBe(SERVICIO.nombre);
    expect(texto('.sg-reserva__meta')).toBe('Duración: 60 min');
    expect(component.dias().slice(0, 4).map((d) => d.fecha)).toEqual(['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26']);
    component.elegirDia({ target: { value: '2026-10-19' } } as unknown as Event);
    expect(component.horas()).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
    await pintar();
    expect(host().querySelectorAll('option').length).toBeGreaterThan(10);
    expect(host().querySelector('[class*="libre"], [class*="free"]')).toBeNull();
    expect(guion.vistas).toEqual([]);
  });

  // ── Feliz: cotizar → abrir → confirmar → comprobante ────────────────────────

  it('elegir cotiza el total DEL SERVIDOR; abrir lleva la llave de la intención; confirmar deja el comprobante con número, franja y total', async () => {
    const guion = puerta({ cotizar: COTIZA, abrir: () => ok(respuesta('Running')), cerrar: () => ok(respuesta('Completed')) });
    await montar(CONFIG, { guion });

    await elegir();
    expect(texto('.sg-reserva__total strong')).toBe('$ 140.000');
    await component.reservar();
    await pintar();
    expect(component.pantalla()).toBe('apartada');
    expect(aviso()).toBe('Tu franja está apartada. Confirma para pagar y asegurarla.');
    // Sin el vencimiento del servidor (NB-5) no se muestra ninguno: la pantalla no lo calcula por su cuenta.
    expect(host().textContent).not.toMatch(/vence|expira|minutos/i);
    expect(leerPendiente(SERVICIO.id)?.id).toBe('rs-1');

    await component.confirmar();
    await pintar();

    expect(guion.ops()).toEqual(['cotizar', 'abrir', 'cerrar']);
    const [abrir] = guion.de('abrir');
    expect(abrir!.cabeceras['Idempotency-Key']).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.parse(abrir!.cuerpo ?? '{}')).toEqual({ servicio: { kind: 'reservas.servicio', id: SERVICIO.id }, ventana: VENTANA });
    expect(guion.de('cerrar')[0]!.url).toBe('/api/flujos/reservas.servicio/cerrar?id=rs-1');
    expect(component.pantalla()).toBe('confirmada');
    expect(texto('.sg-reserva__numero strong')).toBe('R-0001');
    expect(texto('.sg-reserva__comprobante')).toContain('10:00–11:00');
    expect(texto('.sg-reserva__comprobante .sg-reserva__total strong')).toBe('$ 140.000');
    expect(texto('.sg-reserva__comprobante')).toContain('contacta al negocio');
    expect(leerPendiente(SERVICIO.id)).toBeNull();
  });

  it('sin total del servidor no se muestra ningún precio', async () => {
    const guion = puerta({ cotizar: () => ok({ flujo: 'reservas.servicio', datos: { servicio: SERVICIO.id, ventana: VENTANA, total: null } }) });
    await montar(CONFIG, { guion });

    await elegir();

    expect(component.cotizacion().estado).toBe('ok');
    expect(host().querySelector('.sg-reserva__total')).toBeNull();
    expect(host().textContent).not.toMatch(/\$/);
  });

  it('el pedido no sale sin franja ni total cotizado: reservar antes de cotizar no llama a abrir', async () => {
    const guion = puerta({ cotizar: () => no('booking.unreachable', 503, true) });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();

    expect(guion.ops()).toEqual(['cotizar']);
    expect(component.puedeReservar()).toBe(false);
  });

  // ── Lo que falla, dicho sin inventar ────────────────────────────────────────

  it('abrir con un 503 transitorio NO se reintenta solo: una sola petición, y reintentar repite la MISMA llave', async () => {
    const guion = puerta({ cotizar: COTIZA, abrir: [() => no('booking.unreachable', 503, true), () => ok(respuesta('Running'))] });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();
    await pintar();

    expect(guion.ops()).toEqual(['cotizar', 'abrir']);
    expect(component.pantalla()).toBe('sin-respuesta');
    expect(aviso()).toBe('Algo falló. Revisa el estado de tu reserva antes de intentar de nuevo.');
    expect(leerPendiente(SERVICIO.id)?.id).toBeNull();

    await component.reintentar();
    await pintar();

    const [primera, segunda] = guion.de('abrir');
    expect(segunda!.cabeceras['Idempotency-Key']).toBe(primera!.cabeceras['Idempotency-Key']);
    expect(component.pantalla()).toBe('apartada');
  });

  it('la puerta que no abre el flujo (503 puerta.flujo_no_disponible) dice «no disponible» y no reintenta', async () => {
    const guion = puerta({ cotizar: COTIZA, abrir: () => no('puerta.flujo_no_disponible', 503) });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();
    await pintar();

    expect(guion.ops()).toEqual(['cotizar', 'abrir']);
    expect(component.pantalla()).toBe('no-disponible');
    expect(texto('.sg-reserva__nota')).toBe('La reserva en línea no está disponible ahora.');
    expect(leerPendiente(SERVICIO.id)).toBeNull();
  });

  it('la franja tomada al apartar pide otra hora: el texto por code y la hora sin elegir', async () => {
    const guion = puerta({ cotizar: COTIZA, abrir: () => no('booking.at_capacity', 409) });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();
    await pintar();

    expect(aviso()).toBe('Esa hora ya no está. Elige otra.');
    expect(component.pantalla()).toBe('elegir');
    expect(component.hora()).toBe('');
    expect(leerPendiente(SERVICIO.id)).toBeNull();
  });

  it('confirmar sin una respuesta legible CONSULTA antes de afirmar: si quedó completa, el comprobante', async () => {
    const guion = puerta({
      cotizar: COTIZA,
      abrir: () => ok(respuesta('Running')),
      cerrar: () => no('cliente.respuesta_ilegible', 200, false, 'forma'),
      consultar: () => ok(respuesta('Completed')),
    });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();
    await component.confirmar();
    await pintar();

    expect(guion.ops()).toEqual(['cotizar', 'abrir', 'cerrar', 'consultar']);
    expect(component.pantalla()).toBe('confirmada');
  });

  it('si tampoco se puede leer en qué quedó, no afirma nada: «revisa tu reserva», nunca «no se cobró»', async () => {
    const guion = puerta({
      cotizar: COTIZA,
      abrir: () => ok(respuesta('Running')),
      cerrar: () => no('booking.unreachable', 503, true),
      consultar: [() => no('cliente.red', 0, true, 'red'), () => ok(respuesta('Completed'))],
    });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();
    await component.confirmar();
    await pintar();

    expect(component.pantalla()).toBe('desconocida');
    expect(aviso()).toBe('Algo falló. Revisa el estado de tu reserva antes de intentar de nuevo.');
    expect(host().textContent).not.toContain('no se cobró');
    expect(leerPendiente(SERVICIO.id)?.id).toBe('rs-1');

    component.revisarDeNuevo();
    await pintar();
    expect(component.pantalla()).toBe('confirmada');
  });

  it('el pago rechazado al confirmar: consulta, la reserva quedó deshecha, lo dice y vuelve a elegir', async () => {
    const guion = puerta({
      cotizar: COTIZA,
      abrir: () => ok(respuesta('Running')),
      cerrar: () => no('payments.capture_failed', 402),
      consultar: () => ok(respuesta('Compensated')),
    });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();
    await component.confirmar();
    await pintar();

    expect(guion.ops()).toEqual(['cotizar', 'abrir', 'cerrar', 'consultar']);
    expect(aviso()).toBe('El pago no pasó. Puedes intentar de nuevo.');
    expect(component.pantalla()).toBe('elegir');
    expect(leerPendiente(SERVICIO.id)).toBeNull();
  });

  it('cancelar lo no confirmado: deshecha del todo → «no se cobró nada»; deshaciéndose → no lo afirma', async () => {
    const guion = puerta({
      cotizar: COTIZA,
      abrir: [() => ok(respuesta('Running')), () => ok(respuesta('Running', { id: 'rs-2' }))],
      cancelar: [() => ok(respuesta('Compensated')), () => ok(respuesta('Compensating', { id: 'rs-2', compensacionesPendientes: 1 }))],
    });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();
    await component.cancelar();
    await pintar();
    expect(aviso()).toBe('Reserva cancelada: no se cobró nada.');
    expect(component.pantalla()).toBe('elegir');

    await elegir(MIERCOLES, '11:00');
    await component.reservar();
    await component.cancelar();
    await pintar();
    expect(component.pantalla()).toBe('desconocida');
    expect(aviso()).toBe('Revisando el estado de tu reserva');
  });

  it('una pendiente se resuelve antes de abrir otra: reservar con una pendiente la pone en pantalla y no abre', async () => {
    const guion = puerta({ cotizar: COTIZA, abrir: () => ok(respuesta('Running', { id: 'rs-9' })), consultar: () => ok(respuesta('Running')) });
    await montar(CONFIG, { guion });
    await elegir();
    // Otro bloque de la misma página dejó una reserva abierta de este servicio.
    sessionStorage.setItem(
      `synergos:reserva:pendiente:${SERVICIO.id}`,
      JSON.stringify({ servicio: SERVICIO.id, ventana: VENTANA, llave: 'f'.repeat(32), id: 'rs-1' }),
    );

    await component.reservar();
    await pintar();

    expect(guion.ops()).toEqual(['cotizar', 'consultar']);
    expect(component.pantalla()).toBe('apartada');
    expect(component.reserva()?.id).toBe('rs-1');
  });

  it('al volver con una pendiente guardada, la consulta y la ofrece para terminar o cancelar', async () => {
    sessionStorage.setItem(
      `synergos:reserva:pendiente:${SERVICIO.id}`,
      JSON.stringify({ servicio: SERVICIO.id, ventana: VENTANA, llave: 'f'.repeat(32), id: 'rs-1' }),
    );
    const guion = puerta({ consultar: () => ok(respuesta('Running')) });
    await montar(CONFIG, { guion });

    expect(guion.ops()).toEqual(['consultar']);
    expect(component.pantalla()).toBe('apartada');
    expect(Array.from(host().querySelectorAll('button'), (b) => b.textContent?.trim())).toEqual(['Confirmar y pagar', 'Cancelar la reserva']);
  });

  // ── Sesión y enlace del aviso ───────────────────────────────────────────────

  it('con el CMS delante y sin miembro: elegir no cotiza, y el enlace al login vuelve a esta página', async () => {
    const guion = puerta({ cotizar: COTIZA });
    await montar(CONFIG, { guion, bridge: { member: null } });

    await elegir();

    expect(guion.vistas).toEqual([]);
    const enlace = host().querySelector<HTMLAnchorElement>('a.sg-reserva__cta');
    expect(enlace?.textContent?.trim()).toBe('Inicia sesión para reservar');
    expect(enlace?.getAttribute('href')).toBe(`/account/login?returnUrl=${encodeURIComponent('/')}`);
    expect(host().querySelector('button.sg-reserva__cta')).toBeNull();
  });

  it('la sesión que vence a mitad (401) lleva al login y no afirma nada', async () => {
    const guion = puerta({ cotizar: COTIZA, abrir: () => no('puerta.sesion_requerida', 401) });
    await montar(CONFIG, { guion });

    await elegir();
    await component.reservar();
    await pintar();

    expect(component.pantalla()).toBe('sesion');
    expect(host().querySelector('a.sg-reserva__cta')?.getAttribute('href')).toContain('/account/login?returnUrl=');
  });

  it('el enlace del aviso (?reserva=) consulta esa reserva, muestra el comprobante y sale de la URL', async () => {
    window.history.replaceState(null, '', '/booking/reservar/?reserva=rs-1');
    const guion = puerta({ consultar: () => ok(respuesta('Completed')) });
    await montar(CONFIG, { guion });

    expect(guion.de('consultar')[0]!.url).toBe('/api/flujos/reservas.servicio/consultar?id=rs-1');
    expect(component.pantalla()).toBe('confirmada');
    expect(window.location.search).toBe('');
  });

  it('el enlace del aviso sin sesión pide el login con un returnUrl que conserva ?reserva=, sin llamar a nada', async () => {
    window.history.replaceState(null, '', '/booking/reservar/?reserva=rs-1');
    const guion = puerta({ consultar: () => ok(respuesta('Completed')) });
    await montar(CONFIG, { guion, bridge: { member: null } });

    expect(guion.vistas).toEqual([]);
    expect(component.pantalla()).toBe('sesion');
    expect(host().querySelector('a.sg-reserva__cta')?.getAttribute('href')).toBe(
      `/account/login?returnUrl=${encodeURIComponent('/booking/reservar/?reserva=rs-1')}`,
    );
  });

  // ── Lo que no reserva, y no llama a nada ────────────────────────────────────

  it('apagada: el enlace alternativo del editor y CERO llamadas a la puerta', async () => {
    const guion = puerta({ cotizar: COTIZA, abrir: () => ok(respuesta('Running')) });
    await montar({ ...CONFIG, camino: 'apagada' }, { guion });

    await elegir();
    await component.reservar();

    expect(guion.vistas).toEqual([]);
    const enlace = host().querySelector<HTMLAnchorElement>('a.sg-reserva__cta');
    expect(enlace?.getAttribute('href')).toBe('/contacto/');
    expect(enlace?.textContent?.trim()).toBe('Escríbenos para reservar');
  });

  it('no-disponible (la puerta no abre el flujo en el despliegue): lo dice y no llama a nada', async () => {
    const guion = puerta({ cotizar: COTIZA });
    await montar({ ...CONFIG, camino: 'no-disponible' }, { guion });

    await elegir();

    expect(guion.vistas).toEqual([]);
    expect(texto('.sg-reserva__nota')).toBe('La reserva en línea no está disponible ahora.');
  });

  it('sin <synergos-flujo> arriba no hay reserva: «no disponible», sin red', async () => {
    await montar(CONFIG, { coordinador: false });

    expect(component.pantalla()).toBe('no-disponible');
  });

  it('un servicio al que le falta algo no se ofrece: «servicio no configurado»', async () => {
    await montar({ ...CONFIG, servicio: { ...SERVICIO, dias: [] } });

    expect(component.pantalla()).toBe('sin-servicio');
    expect(texto('.sg-reserva__nota')).toBe('Este bloque todavía no tiene un servicio reservable.');
  });

  it('el sanitizador cierra el camino y descarta el servicio incompleto', () => {
    expect(sanitizeReservaConfig({ camino: 'directa' } as never).camino).toBeUndefined();
    expect(sanitizeReservaConfig({ camino: ' Apagada ' } as never).camino).toBe('apagada');
    expect(sanitizeReservaConfig({ servicio: { ...SERVICIO, abre: '18:00', cierra: '08:00' } } as never).servicio).toBeUndefined();
    expect(sanitizeReservaConfig({ servicio: { ...SERVICIO, dias: ['Lunes', 'Monday'] } } as never).servicio?.dias).toEqual(['Monday']);
  });
});
