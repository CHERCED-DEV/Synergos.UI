import { TestBed } from '@angular/core/testing';
import { HostIdentityService } from './host-identity.service';

/**
 * Los cuatro casos del seam, y uno más que este defecto obliga a tener.
 *
 * El servicio lee `window.synergos` UNA vez al construirse —el bridge lo emite
 * el servidor por render, así que no cambia mientras la página vive—, de modo
 * que cada caso monta su `window.synergos` **antes** de pedir la instancia.
 *
 * El caso que no es obvio y es el que importa: **«no hay host» y «hay host y
 * nadie con sesión» no son lo mismo.** Los dos dejan `member` en `null` y piden
 * respuestas opuestas — sin host un elemento montado en standalone tiene que
 * comportarse como siempre; con host, la ausencia de miembro sí significa «hay
 * que entrar». Por eso existe `hasHost()` y por eso tiene su propio caso.
 */

interface TestWindow {
  synergos?: unknown;
}

function setBridge(value: unknown): void {
  (globalThis as unknown as TestWindow).synergos = value;
}

function clearBridge(): void {
  delete (globalThis as unknown as TestWindow).synergos;
}

function build(): HostIdentityService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [HostIdentityService] });
  return TestBed.inject(HostIdentityService);
}

const MEMBER = {
  key: 'a1b2c3d4e5f6',
  displayName: 'Camila Restrepo',
  email: 'camila@ejemplo.co',
  roles: ['Instructor', 'Estudiante'],
};

describe(HostIdentityService.name, () => {
  afterEach(() => {
    clearBridge();
  });

  // ─── vacío: sin host ────────────────────────────────────────────────────────
  it('sin host se comporta como anónimo y NO dice que haya host', () => {
    clearBridge();
    const service = build();

    expect(service.member()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.hasHost()).toBe(false);
    expect(service.displayName()).toBe('');
    expect(service.email()).toBe('');
    expect(service.key()).toBe('');
    expect(service.hasAnyRole('instructor')).toBe(false);
  });

  // ─── el caso que distingue: hay host, no hay sesión ──────────────────────────
  it('con host y sin sesión dice que SÍ hay host — es lo que separa «entrar» de «standalone»', () => {
    setBridge({ version: '1.1.0', member: null });
    const service = build();

    expect(service.member()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.hasHost()).toBe(true);
  });

  // ─── feliz ──────────────────────────────────────────────────────────────────
  it('con miembro expone nombre, correo y llave del host', () => {
    setBridge({ version: '1.1.0', member: MEMBER });
    const service = build();

    expect(service.isAuthenticated()).toBe(true);
    expect(service.hasHost()).toBe(true);
    expect(service.displayName()).toBe('Camila Restrepo');
    expect(service.email()).toBe('camila@ejemplo.co');
    expect(service.key()).toBe('a1b2c3d4e5f6');
  });

  // ─── filtro: los roles ──────────────────────────────────────────────────────
  it('hasAnyRole es case-insensitive y basta con uno', () => {
    setBridge({ version: '1.1.0', member: MEMBER });
    const service = build();

    expect(service.hasAnyRole('instructor')).toBe(true);
    expect(service.hasAnyRole('INSTRUCTOR')).toBe(true);
    expect(service.hasAnyRole('admin', 'instructor')).toBe(true);
  });

  it('hasAnyRole es false para un rol que no tiene, y para la lista vacía', () => {
    setBridge({ version: '1.1.0', member: MEMBER });
    const service = build();

    expect(service.hasAnyRole('funcionario')).toBe(false);
    expect(service.hasAnyRole()).toBe(false);
  });

  it('un anónimo con host no tiene ningún rol', () => {
    setBridge({ version: '1.1.0', member: null });
    const service = build();

    expect(service.hasAnyRole('instructor', 'admin')).toBe(false);
  });

  // ─── idempotente ────────────────────────────────────────────────────────────
  it('leer dos veces da lo mismo, y cambiar el bridge DESPUÉS no lo mueve', () => {
    setBridge({ version: '1.1.0', member: MEMBER });
    const service = build();

    expect(service.displayName()).toBe('Camila Restrepo');

    // El bridge es de servidor y por render: si la sesión cambia, cambia la
    // página. Que una instantánea vieja se reescriba sola sería peor que no
    // reescribirse — dejaría media pantalla hablando de otra persona.
    setBridge({ version: '1.1.0', member: { ...MEMBER, displayName: 'Otra' } });

    expect(service.displayName()).toBe('Camila Restrepo');
    expect(service.displayName()).toBe('Camila Restrepo');
  });

  // ─── basura: el host existe pero miente ─────────────────────────────────────
  it('un bridge con forma inesperada no revienta — cae a anónimo', () => {
    setBridge({ version: '1.1.0', member: 'no-soy-un-objeto' });
    const service = build();

    expect(() => service.isAuthenticated()).not.toThrow();
    expect(service.displayName()).toBe('');
  });
});
