/**
 * El set de iconos de Synergos: por NOMBRE, en SVG de línea (24 × 24, trazo 2), dentro del
 * design system (UI#89).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. `syn-icon` no tenía set: con `name` y sin `symbol` pintaba la palabra
 * («check Envío gratis…»), y el ElementType de `icon-label` prometía «la clave del icono del set
 * CDN» de un set que no existía. Se decidió un registro propio y en línea, no un sprite por red
 * ni una librería nueva: viaja con el runtime compartido, funciona dentro del shadow DOM y sin
 * peticiones, y su lista de nombres es el VOCABULARIO que el CMS ofrece al editor en un
 * desplegable (el mismo, cruzado por el gate de selectores, regla 52).
 *
 * Los trazos son propios —geometría simple, no copiada de ninguna librería—. Añadir un icono es
 * añadir una entrada; el CMS lo ofrece cuando su DataType lo nombra, y el gate avisa si los dos
 * lados dejan de decir lo mismo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un círculo como trazo de `path` (el set es sólo `path`, para pintarlo con un único bucle). */
function circulo(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

/** Los iconos, por nombre: cada uno, sus trazos. Nombres en minúscula con guiones. */
export const ICONOS = {
  'alert-circle': [circulo(12, 12, 9), 'M12 8v5', 'M12 16h.01'],
  'alert-triangle': ['M12 4L2 20h20L12 4z', 'M12 10v4', 'M12 17h.01'],
  'arrow-down': ['M12 5v14', 'M6 13l6 6 6-6'],
  'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  'arrow-up': ['M12 19V5', 'M6 11l6-6 6 6'],
  award: [circulo(12, 9, 6), 'M8.5 14L7 22l5-3 5 3-1.5-8'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z', 'M10 20a2 2 0 0 0 4 0'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  check: ['M5 12l5 5L20 7'],
  'check-circle': [circulo(12, 12, 9), 'M8 12l3 3 5-6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  clock: [circulo(12, 12, 9), 'M12 7v5l3 2'],
  'credit-card': ['M3 6h18v12H3z', 'M3 10h18', 'M7 15h4'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13 7l4 4'],
  'external-link': ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', circulo(12, 12, 3)],
  'file-text': ['M6 3h8l5 5v13H6z', 'M14 3v5h5', 'M9 13h7', 'M9 17h7'],
  gift: ['M3 9h18v4H3z', 'M5 13h14v8H5z', 'M12 9v12', 'M12 9c-2-4-5-4-5-2s3 2 5 2', 'M12 9c2-4 5-4 5-2s-3 2-5 2'],
  globe: [circulo(12, 12, 9), 'M3 12h18', 'M12 3c3 3.2 3 14.8 0 18', 'M12 3c-3 3.2-3 14.8 0 18'],
  heart: ['M12 20C6 16 3 12.5 3 9a4.5 4.5 0 0 1 9-1.5A4.5 4.5 0 0 1 21 9c0 3.5-3 7-9 11z'],
  'help-circle': [circulo(12, 12, 9), 'M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 4', 'M12 17h.01'],
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  image: ['M3 5h18v14H3z', circulo(8.5, 9.5, 1.5), 'M21 16l-5-5-9 8'],
  info: [circulo(12, 12, 9), 'M12 11v5', 'M12 8h.01'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  mail: ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  'map-pin': ['M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z', circulo(12, 9, 2.5)],
  message: ['M4 5h16v11H9l-5 4V5z'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  minus: ['M5 12h14'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
  play: ['M7 4l13 8-13 8V4z'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: [circulo(11, 11, 7), 'M20 20l-4-4'],
  settings: [
    circulo(12, 12, 3),
    'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3',
    'M4.9 4.9L7 7', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1',
  ],
  'shield-check': ['M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z', 'M8.5 12l2.5 2.5 4.5-5'],
  'shopping-cart': ['M3 4h2l2.4 11h10.2L20 8H6.2', circulo(9, 19, 1.5), circulo(17, 19, 1.5)],
  star: ['M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.5l-5.6 2.9 1.1-6.3L3 9.7l6.2-.9L12 3z'],
  tag: ['M3 12V4h8l10 10-8 8-10-10z', 'M7.5 7.5h.01'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14'],
  truck: ['M2 6h12v10H2z', 'M14 10h4l3 3v3h-7', circulo(6, 18, 2), circulo(17, 18, 2)],
  upload: ['M12 20V8', 'M7 13l5-5 5 5', 'M4 4h16'],
  user: [circulo(12, 8, 4), 'M4 21c0-4 4-6 8-6s8 2 8 6'],
  users: [circulo(9, 8, 3.5), 'M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14.8c2.4.6 4 2.4 4 5.2'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  'x-circle': [circulo(12, 12, 9), 'M9 9l6 6', 'M15 9l-6 6'],
  zap: ['M13 2L4 14h7l-1 8 9-12h-7l1-8z'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** El nombre de un icono del set. */
export type NombreDeIcono = keyof typeof ICONOS;

/** Los nombres del set, ordenados: el vocabulario que el CMS le ofrece al editor. */
export const NOMBRES_DE_ICONO = Object.keys(ICONOS).sort() as readonly NombreDeIcono[];

/** Los trazos de `nombre`, o `null` si el set no lo tiene (no se pinta la palabra en su lugar). */
export function trazosDeIcono(nombre: string | null | undefined): readonly string[] | null {
  const clave = (nombre ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ICONOS, clave) ? ICONOS[clave as NombreDeIcono] : null;
}
