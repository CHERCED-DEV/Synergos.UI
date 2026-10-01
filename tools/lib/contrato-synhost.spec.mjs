import { describe, expect, it } from 'vitest';

import { constanteDe, cruzarConRegistry, generarTs, validarContrato } from './contrato-synhost.mjs';

/** Un contrato con la forma que emite `ContratoSynHostTests`: una pieza con lista de records. */
const contrato = () => ({
  comentario: 'fixture',
  elementos: [
    {
      nombre: 'carousel',
      tipo: 'pieza',
      record: 'CarouselProps',
      diccionario: [],
      campos: [
        { nombre: 'slides', tipo: 'CarouselSlide[]', opcional: true, origen: 'contenido' },
        { nombre: 'autoplay', tipo: 'boolean', opcional: true, origen: 'decision' },
        { nombre: 'interval', tipo: 'number', opcional: true, origen: 'decision' },
      ],
      ejemplo: { culture: 'es-CO', slides: [{ src: '/a.jpg' }], autoplay: true, interval: 4000 },
    },
  ],
  tipos: [
    {
      record: 'CarouselSlide',
      campos: [
        { nombre: 'src', tipo: 'string', opcional: false },
        { nombre: 'alt', tipo: 'string', opcional: true },
      ],
    },
  ],
});

describe('validarContrato', () => {
  it('no reporta nada sobre un contrato bien formado (happy)', () => {
    expect(validarContrato(contrato())).toEqual([]);
  });

  it('rechaza un contrato sin elementos: generaría tipos vacíos que compilan (red por el vacío)', () => {
    expect(validarContrato({ elementos: [], tipos: [] })).toHaveLength(1);
    expect(validarContrato({})).toHaveLength(1);
  });

  it('rechaza un ejemplo con una clave que el record no declara', () => {
    const c = contrato();
    c.elementos[0].ejemplo.slidesJson = '[]';
    expect(validarContrato(c).join('\n')).toContain('«slidesJson»');
  });

  // ADR 0136 (CMS#186): el contrato trae, por elemento, las claves de uSync de sus secciones.
  it('acepta las claves de las secciones que declara el elemento', () => {
    const c = contrato();
    c.elementos[0].diccionario = ['Slider'];
    c.elementos[0].claves = ['Slider.Next', 'Slider.Previous'];
    expect(validarContrato(c)).toEqual([]);
  });

  it('rechaza una sección declarada que no casa ninguna clave: un prefijo vacío', () => {
    const c = contrato();
    c.elementos[0].diccionario = ['Slider', 'Comments'];
    c.elementos[0].claves = ['Slider.Next'];
    expect(validarContrato(c).join('\n')).toContain('«Comments» no casa ninguna clave');
    delete c.elementos[0].claves;
    expect(validarContrato(c).join('\n')).toContain('prefijo vacío');
  });

  it('rechaza una clave que no cae en las secciones declaradas', () => {
    const c = contrato();
    c.elementos[0].diccionario = ['Slider'];
    c.elementos[0].claves = ['Slider.Next', 'Rating.Submit'];
    expect(validarContrato(c).join('\n')).toContain('«Rating.Submit» no cae en ninguna sección');
  });

  it('rechaza un ejemplo sin la envoltura que el emitter añade siempre', () => {
    const c = contrato();
    delete c.elementos[0].ejemplo.culture;
    expect(validarContrato(c).join('\n')).toContain('culture');
  });

  it('rechaza un tipo sin traducción, un campo sin origen y un nombre que no es de registry (filter)', () => {
    const c = contrato();
    c.elementos[0].campos[1].tipo = 'Date';
    c.elementos[0].campos[2].origen = 'negocio';
    c.elementos[0].nombre = 'Carousel';
    const errores = validarContrato(c).join('\n');
    expect(errores).toContain('«Date» sin traducción');
    expect(errores).toContain('origen «negocio»');
    expect(errores).toContain('no es un nombre de registry');
  });

  it('rechaza una lista de un record que el contrato no trae', () => {
    const c = contrato();
    c.tipos = [];
    expect(validarContrato(c).join('\n')).toContain('«CarouselSlide[]» sin traducción');
  });
});

describe('cruzarConRegistry', () => {
  it('acepta un elemento que el registry conoce y rechaza uno que no', () => {
    expect(cruzarConRegistry(contrato(), [{ name: 'carousel' }])).toEqual([]);
    expect(cruzarConRegistry(contrato(), [{ name: 'hero' }])).toHaveLength(1);
  });
});

describe('generarTs', () => {
  it('declara cada record con sus campos, opcionales y listas de solo lectura', () => {
    const ts = generarTs(contrato());
    expect(ts).toContain('export interface CarouselProps {');
    expect(ts).toContain('  readonly slides?: readonly CarouselSlide[];');
    expect(ts).toContain('  readonly interval?: number;');
    expect(ts).toContain('export interface CarouselSlide {');
    expect(ts).toContain('  readonly src: string;');
  });

  it('publica el ejemplo tipado con su record y la lista de todos los elementos', () => {
    const ts = generarTs(contrato());
    expect(ts).toContain('export const CAROUSEL_SYNHOST: ElementoSynHost<CarouselProps> = {');
    expect(ts).toContain('"src": "/a.jpg"');
    expect(ts).toContain('  listas: {"slides":["src","alt"]},');
    expect(ts).toMatch(/export const ELEMENTOS_SYNHOST = \[\n {2}CAROUSEL_SYNHOST,\n\] as const;/);
  });

  it('es determinista: el mismo contrato da el mismo texto (idempotent)', () => {
    expect(generarTs(contrato())).toBe(generarTs(contrato()));
  });

  it('nombra la constante de un elemento por su nombre de registry', () => {
    expect(constanteDe('kpi-card')).toBe('KPI_CARD_SYNHOST');
    expect(constanteDe('rating-stars')).toBe('RATING_STARS_SYNHOST');
  });
});
