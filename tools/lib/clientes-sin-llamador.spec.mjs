import { describe, expect, it } from 'vitest';

import {
  SIN_LLAMADOR,
  cruzarLlamadores,
  metodosPublicos,
  sinComentariosNiCadenas,
} from './clientes-sin-llamador.mjs';

const CLIENTE = `
import { algo } from './otro';

export class BlogsApiClient {
  private readonly base = 1;

  async feed(apiBase: string): Promise<void> {}

  async search(apiBase: string, query: string): Promise<void> {}

  get degraded(): boolean { return false; }

  private markDegraded(ruta: string): void {}

  #interno(): void {}
}
`;

/** El vecino que sí llama, con su import del cliente. */
const LLAMADOR = `
import { BlogsApiClient } from './blogs-api.client';
const api = new BlogsApiClient();
await api.feed('/api/blogs');
`;

const cliente = (extra = []) => [
  {
    vertical: 'blogs',
    cliente: 'blogs-api.client.ts',
    fuente: CLIENTE,
    vecinos: [{ ruta: 'blogs.ts', fuente: LLAMADOR }, ...extra],
  },
];

describe('metodosPublicos', () => {
  it('toma los públicos y deja fuera private, protected, #privados y get/set', () => {
    expect(metodosPublicos(CLIENTE)).toEqual(['feed', 'search']);
  });

  it('no confunde una palabra clave con un método', () => {
    const fuente = `
export class X {
  async hace(): Promise<void> {
    if (true) {
      return;
    }
    for (const a of []) {}
  }
}
`;
    // `if (`, `for (` y `return` viven indentados a cuatro, no a dos, y además están listados:
    // los dos cortes tienen que dar sólo el método.
    expect(metodosPublicos(fuente)).toEqual(['hace']);
  });
});

describe('cruzarLlamadores', () => {
  it('no reporta nada cuando todo método público tiene llamador (happy)', () => {
    const sinBusqueda = CLIENTE.replace(/\n  async search[^\n]*\n/, '\n');
    const { fallos, medidos } = cruzarLlamadores(
      [{ vertical: 'blogs', cliente: 'c.ts', fuente: sinBusqueda, vecinos: [{ ruta: 'blogs.ts', fuente: LLAMADOR }] }],
      {},
    );
    expect(fallos).toEqual([]);
    expect(medidos).toBe(1);
  });

  it('caza un método público sin llamador y lo nombra (#76)', () => {
    const { fallos, sinLlamador } = cruzarLlamadores(cliente(), {});
    expect(sinLlamador).toEqual(['blogs::search']);
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('blogs::search');
    // Y no dice «sobra»: dice qué decidir, porque borrarlo fue justo la salida equivocada.
    expect(fallos[0]).toContain('mirá qué contesta antes');
  });

  it('un SPEC no cuenta como llamador — es el corazón del cruce', () => {
    // El único llamador de `blogs::search` era un spec que probaba su MOCK con la red caída.
    // Contarlo habría dado cero hallazgos. Acá el spec ni llega: lo filtra el recorrido, así
    // que se comprueba que un vecino que llama SÍ lo salva y el cruce depende de eso.
    const conLlamada = cliente([{ ruta: 'otro.ts', fuente: LLAMADOR.replace('.feed(', '.search(') }]);
    expect(cruzarLlamadores(conLlamada, {}).fallos).toEqual([]);
  });

  it('acepta lo censado y no lo reporta', () => {
    const { fallos, sinLlamador } = cruzarLlamadores(cliente(), {
      'blogs::search': { razon: 'porque sí' },
    });
    expect(fallos).toEqual([]);
    expect(sinLlamador).toEqual(['blogs::search']);
  });

  it('rompe si una entrada del censo ya no corresponde (el segundo diente)', () => {
    const conLlamada = cliente([{ ruta: 'otro.ts', fuente: LLAMADOR.replace('.feed(', '.search(') }]);
    const { fallos } = cruzarLlamadores(conLlamada, { 'blogs::search': { razon: 'porque sí' } });
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('ya no corresponde');
  });

  it('rechaza cero clientes en vez de pasar en verde (red de seguridad)', () => {
    const { fallos, medidos } = cruzarLlamadores([], SIN_LLAMADOR);
    expect(medidos).toBe(0);
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('el recorrido dejó de ver');
    // Y no se lleva el censo por delante: sin esto, cero clientes haría que el segundo diente
    // declarara rancia cada entrada, o sea el gate pidiendo borrar el censo entero.
    expect(fallos[0]).not.toContain('ya no corresponde');
  });
});

describe('sinComentariosNiCadenas', () => {
  // Las dos direcciones, medidas y no afirmadas — el addendum del repo hermano sobre
  // `feedback_a_gate_that_parses_source_needs_its_own_mutations`.
  it('un comentario que NOMBRA la llamada no la cuenta (falso negativo)', () => {
    const conProsa = cliente([
      { ruta: 'pendiente.ts', fuente: `${LLAMADOR}\n// TODO: acá habría que llamar a api.search(q) — pendiente\n` },
    ]);
    const { fallos } = cruzarLlamadores(conProsa, {});
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('blogs::search');

    // Y la prueba de que es el barrido lo que lo sostiene: sin él, la prosa lo salvaría.
    expect(conProsa[0].vecinos.some((v) => v.fuente.includes('.search('))).toBe(true);
  });

  it('un literal con la forma de una llamada tampoco la cuenta', () => {
    const conLiteral = cliente([
      { ruta: 'url.ts', fuente: `${LLAMADOR}\nconst u = \`\${base}.search(\`;\n` },
    ]);
    expect(cruzarLlamadores(conLiteral, {}).fallos).toHaveLength(1);
  });

  it('conserva los saltos de línea para que el corte por indentación siga funcionando', () => {
    const fuente = '  async a(): void {}\n  /* x\n y */\n  async b(): void {}\n';
    expect(metodosPublicos(fuente)).toEqual(['a', 'b']);
    expect(sinComentariosNiCadenas(fuente).split('\n')).toHaveLength(5);
  });
});

describe('el censo del disco', () => {
  it('cada entrada trae su razón, y la razón dice por qué NO se cablea', () => {
    for (const [clave, entrada] of Object.entries(SIN_LLAMADOR)) {
      expect(entrada.razon, clave).toBeTruthy();
      expect(entrada.razon.length, clave).toBeGreaterThan(80);
      // Una razón que contesta «todavía no» es un ticket sin abrir disfrazado de excepción.
      expect(entrada.razon, clave).not.toMatch(/\btodav[íi]a no se cabl|pendiente de cablear\b/i);
      expect(entrada.ticket, clave).toMatch(/#\d+$/);
    }
  });
});
