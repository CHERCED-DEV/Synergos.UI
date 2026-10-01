import { CLAVES_DE_ENVOLTURA_SYNHOST, ELEMENTOS_SYNHOST } from '@synergos/contracts';
import { createConfigInputTransform } from '@synergos/shared';
import { sanitizeKpiCardConfig } from './modules/kpi-card/src/kpi-card/kpi-card';
import { sanitizeDropdownConfig } from './compositions/dropdown/src/dropdown/dropdown';
import { sanitizeCarouselConfig } from './modules/carousel/src/carousel/carousel';
import { sanitizeRatingStarsConfig } from './compositions/rating-stars/src/rating-stars/rating-stars';
import { sanitizeTagConfig } from './primitives/tag/src/tag/tag';
import { sanitizeScrollTopConfig } from './primitives/scroll-top/src/scroll-top/scroll-top';
import { sanitizeRangeSliderConfig } from './compositions/range-slider/src/range-slider/range-slider';
import { sanitizeSelectMultiConfig } from './compositions/select-multi/src/select-multi/select-multi';
import { sanitizeStepperConfig } from './compositions/stepper/src/stepper/stepper';
import { sanitizeTabsConfig } from './compositions/tabs/src/tabs/tabs';
import { sanitizeTimelineConfig } from './modules/timeline/src/timeline/timeline';
import { sanitizeTourGuideConfig } from './modules/tour-guide/src/tour-guide/tour-guide';
import { sanitizeTreeViewConfig } from './modules/tree-view/src/tree-view/tree-view';
import { sanitizeAccordionConfig } from './compositions/accordion/src/accordion/accordion';
import { sanitizeBadgeGroupConfig } from './compositions/badge-group/src/badge-group/badge-group';
import { sanitizeBreadcrumbConfig } from './primitives/breadcrumb/src/breadcrumb/breadcrumb';
import { sanitizeColorSwatchesConfig } from './compositions/color-swatches/src/color-swatches/color-swatches';
import { sanitizeIconLabelConfig } from './primitives/icon-label/src/icon-label/icon-label';
import { sanitizeNotificationToastConfig } from './modules/notification-toast/src/notification-toast/notification-toast';
import { sanitizeProgressBarConfig } from './primitives/progress-bar/src/progress-bar/progress-bar';
import { sanitizeAudioPlayerConfig } from './modules/audio-player/src/audio-player/audio-player';
import { sanitizeAvatarConfig } from './primitives/avatar/src/avatar/avatar';
import { sanitizeVideoPlayerConfig } from './modules/video-player/src/video-player/video-player';
import { sanitizeHeroBannerConfig } from './modules/hero-banner/src/hero-banner/hero-banner';
import { sanitizeFabConfig } from './primitives/fab/src/fab/fab';
import { sanitizeCookieConsentConfig } from './modules/cookie-consent/src/cookie-consent/cookie-consent';
import { sanitizeShareBarConfig } from './compositions/share-bar/src/share-bar/share-bar';
import { sanitizeRichTooltipConfig } from './compositions/rich-tooltip/src/rich-tooltip/rich-tooltip';
import { sanitizeCountdownClockConfig } from './modules/countdown-clock/src/countdown-clock/countdown-clock';
import { sanitizeCountdownDigitalConfig } from './modules/countdown-digital/src/countdown-digital/countdown-digital';
import { sanitizeAvatarGroupConfig } from './compositions/avatar-group/src/avatar-group/avatar-group';
import { sanitizeLightboxGalleryConfig } from './modules/lightbox-gallery/src/lightbox-gallery/lightbox-gallery';
import { sanitizeChartBarConfig } from './modules/chart-bar/src/chart-bar/chart-bar';
import { sanitizeMapPinConfig } from './modules/map-pin/src/map-pin/map-pin';
import { sanitizeColorPickerConfig } from './compositions/color-picker/src/color-picker/color-picker';
import { sanitizeAppLauncherConfig } from './modules/app-launcher/src/app-launcher/app-launcher';

/**
 * El gate que EJECUTA el sanitizador de cada elemento con el `config` que emite su vista
 * (ADR 0135 · CMS#173).
 *
 * El tipado ya impide leer una clave que el CMS no manda (TS2339). Lo que el tipado NO ve es
 * la mitad contraria: una clave que el CMS manda, que el tipo acepta y que el sanitizador
 * tira —o no lee—. Es la forma exacta en que se midió D1: sanitizador ejecutado con el payload
 * de la vista. Acá el payload no se inventa: es el `ejemplo` del contrato, que el CMS saca de
 * su resolver y su emitter REALES.
 *
 * Cada entrada de esta tabla es un sanitizador envuelto como lo envuelve su componente
 * (`createConfigInputTransform`), así que corre el mismo camino que el atributo `config`.
 * La tabla es a mano, y por eso se cruza en los dos sentidos con el contrato: un elemento
 * con contrato y sin sanitizador acá se pone rojo, que es la red de seguridad por el vacío.
 */
const SANITIZADORES: Readonly<Record<string, (config: unknown) => unknown>> = {
  carousel: createConfigInputTransform(sanitizeCarouselConfig),
  dropdown: createConfigInputTransform(sanitizeDropdownConfig),
  'kpi-card': createConfigInputTransform(sanitizeKpiCardConfig),
  'rating-stars': createConfigInputTransform(sanitizeRatingStarsConfig),
  tag: createConfigInputTransform(sanitizeTagConfig),
  'scroll-top': createConfigInputTransform(sanitizeScrollTopConfig),
  'range-slider': createConfigInputTransform(sanitizeRangeSliderConfig),
  'select-multi': createConfigInputTransform(sanitizeSelectMultiConfig),
  stepper: createConfigInputTransform(sanitizeStepperConfig),
  tabs: createConfigInputTransform(sanitizeTabsConfig),
  timeline: createConfigInputTransform(sanitizeTimelineConfig),
  'tour-guide': createConfigInputTransform(sanitizeTourGuideConfig),
  'tree-view': createConfigInputTransform(sanitizeTreeViewConfig),
  accordion: createConfigInputTransform(sanitizeAccordionConfig),
  'badge-group': createConfigInputTransform(sanitizeBadgeGroupConfig),
  breadcrumb: createConfigInputTransform(sanitizeBreadcrumbConfig),
  'color-swatches': createConfigInputTransform(sanitizeColorSwatchesConfig),
  'icon-label': createConfigInputTransform(sanitizeIconLabelConfig),
  'notification-toast': createConfigInputTransform(sanitizeNotificationToastConfig),
  'progress-bar': createConfigInputTransform(sanitizeProgressBarConfig),
  'audio-player': createConfigInputTransform(sanitizeAudioPlayerConfig),
  avatar: createConfigInputTransform(sanitizeAvatarConfig),
  'video-player': createConfigInputTransform(sanitizeVideoPlayerConfig),
  'hero-banner': createConfigInputTransform(sanitizeHeroBannerConfig),
  fab: createConfigInputTransform(sanitizeFabConfig),
  'cookie-consent': createConfigInputTransform(sanitizeCookieConsentConfig),
  'share-bar': createConfigInputTransform(sanitizeShareBarConfig),
  'rich-tooltip': createConfigInputTransform(sanitizeRichTooltipConfig),
  'countdown-clock': createConfigInputTransform(sanitizeCountdownClockConfig),
  'countdown-digital': createConfigInputTransform(sanitizeCountdownDigitalConfig),
  'avatar-group': createConfigInputTransform(sanitizeAvatarGroupConfig),
  'lightbox-gallery': createConfigInputTransform(sanitizeLightboxGalleryConfig),
  'chart-bar': createConfigInputTransform(sanitizeChartBarConfig),
  'map-pin': createConfigInputTransform(sanitizeMapPinConfig),
  'color-picker': createConfigInputTransform(sanitizeColorPickerConfig),
  'app-launcher': createConfigInputTransform(sanitizeAppLauncherConfig),
};

type Config = Record<string, unknown>;

const esObjeto = (v: unknown): v is Config => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Un campo dentro del `config`: sus claves, con `[]` por «cada ítem de la lista». */
type Ruta = readonly string[];

const texto = (ruta: Ruta): string => ruta.join('.').replaceAll('.[]', '[]');

/**
 * Cada campo que vive DENTRO de otro —de un ítem de una lista, o de un objeto—, a cualquier
 * profundidad: `slides[].label`, `items[].children[].label`. Las claves de primer nivel no
 * entran: las mira «cada clave que viaja mueve la salida».
 *
 * Es recursivo a propósito (CMS#180): con un solo nivel, un sanitizador que tira los NIETOS de
 * un árbol (`tree-view`) dejaba este gate en verde — medido por la tanda C.
 */
function rutasInternas(valor: unknown, ruta: Ruta): Ruta[] {
  if (Array.isArray(valor)) {
    const items = valor.filter(esObjeto);
    const campos = [...new Set(items.flatMap((item) => Object.keys(item)))];
    return campos.flatMap((campo) => {
      const suya = [...ruta, '[]', campo];
      return [suya, ...items.flatMap((item) => rutasInternas(item[campo], suya))];
    });
  }
  if (esObjeto(valor)) {
    return Object.keys(valor).flatMap((campo) => {
      const suya = [...ruta, campo];
      return [suya, ...rutasInternas(valor[campo], suya)];
    });
  }
  return [];
}

/** Las rutas internas de un `config`, sin repetir. */
function camposInternos(config: Config): Ruta[] {
  const vistas = new Map<string, Ruta>();
  for (const [clave, valor] of Object.entries(config)) {
    for (const ruta of rutasInternas(valor, [clave])) vistas.set(texto(ruta), ruta);
  }
  return [...vistas.values()];
}

/** `valor` sin el campo de `ruta` (en cada ítem, si la ruta cruza una lista). */
function sinCampo(valor: unknown, ruta: Ruta): unknown {
  const [cabeza, ...resto] = ruta;
  if (cabeza === undefined) return valor;
  if (cabeza === '[]') return Array.isArray(valor) ? valor.map((item) => sinCampo(item, resto)) : valor;
  if (!esObjeto(valor)) return valor;
  if (resto.length === 0) {
    const copia = { ...valor };
    delete copia[cabeza];
    return copia;
  }
  return { ...valor, [cabeza]: sinCampo(valor[cabeza], resto) };
}

/** Los campos internos cuya ausencia NO mueve la salida de `sanitizar`: los que se tiran. */
function camposMuertos(config: Config, sanitizar: (config: Config) => string): string[] {
  const completa = sanitizar(config);
  return camposInternos(config)
    .filter((ruta) => sanitizar(sinCampo(config, ruta) as Config) === completa)
    .map(texto);
}

describe('contrato SynHost: cada sanitizador, ejecutado con el config que emite su vista', () => {
  it('cada elemento del contrato tiene su sanitizador en esta tabla, y al revés', () => {
    const nombres = ELEMENTOS_SYNHOST.map((e) => e.nombre);

    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres.filter((n) => !(n in SANITIZADORES))).toEqual([]);
    expect(Object.keys(SANITIZADORES).filter((n) => !nombres.includes(n))).toEqual([]);
  });

  for (const elemento of ELEMENTOS_SYNHOST) {
    describe(elemento.nombre, () => {
      const ejemplo = elemento.ejemplo as unknown as Config;
      // Se ejecuta con el atributo como llega: una cadena JSON.
      const salida = (config: Config) => JSON.stringify(SANITIZADORES[elemento.nombre]?.(JSON.stringify(config)) ?? null);

      it('la muestra del CMS ejercita todos los campos del record, los de sus listas incluidos', () => {
        expect(elemento.campos.filter((campo) => !(campo in ejemplo))).toEqual([]);

        const listas = elemento.listas as Readonly<Record<string, readonly string[]>>;
        const sinViajar = Object.entries(listas).flatMap(([campo, internos]) => {
          const items = Array.isArray(ejemplo[campo]) ? (ejemplo[campo] as unknown[]).filter(esObjeto) : [];
          return internos.filter((i) => !items.some((item) => i in item)).map((i) => `${campo}[].${i}`);
        });
        expect(sinViajar).toEqual([]);
      });

      it('cada clave que viaja mueve la salida del sanitizador', () => {
        const completa = salida(ejemplo);
        const muertas = Object.keys(ejemplo)
          .filter((clave) => !CLAVES_DE_ENVOLTURA_SYNHOST.includes(clave as never))
          .filter((clave) => {
            const sin = { ...ejemplo };
            delete sin[clave];
            return salida(sin) === completa;
          });

        expect(muertas).toEqual([]);
      });

      it('cada campo de un ítem de lista mueve la salida del sanitizador, a cualquier profundidad', () => {
        // Red de seguridad por el vacío: el recorrido tiene que encontrar, al menos, los campos
        // de los ítems que el contrato declara. Un recorrido roto que no ve nada daría verde.
        const vistos = camposInternos(ejemplo).map(texto);
        const declarados = Object.entries(elemento.listas as Readonly<Record<string, readonly string[]>>)
          .flatMap(([campo, internos]) => internos.map((i) => `${campo}[].${i}`));
        expect(declarados.filter((d) => !vistos.includes(d))).toEqual([]);

        expect(camposMuertos(ejemplo, salida)).toEqual([]);
      });
    });
  }
});

/**
 * El gate de arriba, contra un fixture propio de DOS niveles (CMS#180). Ningún elemento del
 * contrato tiene todavía una lista dentro de otra, así que sin esto el recorrido recursivo no lo
 * ejercita nadie: con el de un solo nivel, el sanitizador que tira los nietos pasaba en verde.
 */
describe('contrato SynHost: el gate de los campos internos, contra un árbol de dos niveles', () => {
  const arbol: Config = {
    culture: 'es-CO',
    items: [
      { label: 'Colombia', children: [{ label: 'Antioquia', href: '/co/ant' }, { label: 'Cundinamarca' }] },
      { label: 'México' },
    ],
  };
  const comoCable = (resultado: unknown) => JSON.stringify(resultado ?? null);
  const fiel = (config: Config) => comoCable(config['items']);
  const tiraLosNietos = (config: Config) =>
    comoCable(
      (config['items'] as Config[]).map((item) => ({
        label: item['label'],
        children: Array.isArray(item['children']) ? item['children'].map(() => ({})) : undefined,
      })),
    );

  it('el recorrido encuentra los campos de los nietos', () => {
    expect(camposInternos(arbol).map(texto)).toEqual([
      'items[].label',
      'items[].children',
      'items[].children[].label',
      'items[].children[].href',
    ]);
  });

  it('un sanitizador que tira los nietos se pone rojo, campo por campo', () => {
    expect(camposMuertos(arbol, tiraLosNietos)).toEqual(['items[].children[].label', 'items[].children[].href']);
  });

  it('uno que los conserva no', () => {
    expect(camposMuertos(arbol, fiel)).toEqual([]);
  });
});
