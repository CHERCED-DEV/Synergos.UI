import {
  LecturaRechazada,
  enviarJsonAlBorde,
  esRegistro,
  leerBooleano,
  leerJsonDelBorde,
  leerNumero,
  leerTexto,
  leerTextos,
  llamarAlBorde,
} from './borde';

const json = (status: number, cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

describe('la fontanería del borde', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin la base de la API no llama a nada: rechaza, y fetch no se toca', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(llamarAlBorde('', '/api/shop/orders')).rejects.toThrow('sin-api');
    await expect(leerJsonDelBorde('', '/api/shop/orders')).rejects.toThrow('sin-api');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pide JSON con Accept, y un estado que no es 2xx viaja en LecturaRechazada', async () => {
    const fetch = vi.fn(async () => json(401, { error: 'sin sesión' }));
    vi.stubGlobal('fetch', fetch);

    const error = await leerJsonDelBorde('/api/shop', '/api/shop/orders').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LecturaRechazada);
    expect((error as LecturaRechazada).estado).toBe(401);
    expect(fetch).toHaveBeenCalledWith('/api/shop/orders', { method: 'GET', headers: { Accept: 'application/json' } });
  });

  it('envía el cuerpo en JSON y devuelve lo que contestó el servidor', async () => {
    const fetch = vi.fn(async () => json(200, { ok: true }));
    vi.stubGlobal('fetch', fetch);

    await expect(enviarJsonAlBorde('/api/shop', '/api/shop/confirm', { orderRef: 'ord_1' })).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/api/shop/confirm', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{"orderRef":"ord_1"}',
    });
  });

  it('los lectores toleran una forma suelta y no inventan', () => {
    expect(esRegistro({})).toBe(true);
    expect(esRegistro([])).toBe(false);
    expect(esRegistro(null)).toBe(false);
    expect(leerTexto(42)).toBe('42');
    expect(leerTexto({})).toBe('');
    expect(leerNumero('12')).toBe(12);
    expect(leerNumero('nada')).toBe(0);
    expect(leerNumero(Number.NaN)).toBe(0);
    expect(leerBooleano('TRUE')).toBe(true);
    expect(leerBooleano(undefined, true)).toBe(true);
    expect(leerTextos(['a', 3, null, ''])).toEqual(['a', '3']);
  });
});
