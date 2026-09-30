// ─── Lo que viaja a cada elemento con resolver tipado (ADR 0135) ─────────────
// GENERADO por tools/contrato-synhost.mjs desde el repo del CMS:
//   Synergos.CMS.Web/docs/contracts/elementos-synhost.json
// que a su vez GENERA `ContratoSynHostTests` de los records [ElementoSynHost].
// NO se edita a mano. Regenerar: `node tools/contrato-synhost.mjs` · comprobar: `--check`.
//
// El sanitizador de cada elemento se tipa con su interfaz: leer una clave que el CMS
// no manda NO COMPILA. Y `contrato-synhost.spec.ts` lo ejecuta con el `ejemplo`, que es
// el `config` EXACTO que emite la vista: una clave que viaja y nadie lee se pone roja.

/** Lo que el emitter del CMS añade a TODO `config`, fuera del record: la cultura de la petición. */
export interface EnvolturaSynHost {
  readonly culture: string;
}

/** Las claves de la envoltura: viajan siempre y no las declara ningún record. */
export const CLAVES_DE_ENVOLTURA_SYNHOST: readonly (keyof EnvolturaSynHost)[] = ["culture"];

/** Un elemento con contrato: quién es, qué campos viajan y un `config` real de su vista. */
export interface ElementoSynHost<T> {
  readonly nombre: string;
  readonly tipo: 'pieza' | 'funcionalidad';
  readonly record: string;
  readonly diccionario: readonly string[];
  readonly campos: readonly (keyof T & string)[];
  /** Por cada campo que es una lista de records, los campos de sus ítems. */
  readonly listas: Readonly<Partial<Record<keyof T & string, readonly string[]>>>;
  readonly ejemplo: T & EnvolturaSynHost;
}

/** Parte de un record de `ElementoSynHost` (C#: CarouselSlide). */
export interface CarouselSlide {
  readonly src: string;
  readonly alt?: string;
  readonly label?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: DropdownOption). */
export interface DropdownOption {
  readonly value: string;
  readonly label: string;
  readonly href?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: SelectMultiItem). */
export interface SelectMultiItem {
  readonly value: string;
  readonly label: string;
}

/** Parte de un record de `ElementoSynHost` (C#: StepperItem). */
export interface StepperItem {
  readonly title: string;
}

/** Parte de un record de `ElementoSynHost` (C#: TabsItem). */
export interface TabsItem {
  readonly label: string;
  readonly id?: string;
  readonly content?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: TimelineEntry). */
export interface TimelineEntry {
  readonly date?: string;
  readonly title?: string;
  readonly body?: string;
}

/** <synergos-carousel> · pieza */
export interface CarouselProps {
  /** contenido */
  readonly slides?: readonly CarouselSlide[];
  /** decision */
  readonly autoplay?: boolean;
  /** decision */
  readonly interval?: number;
}

/** <synergos-dropdown> · pieza */
export interface DropdownProps {
  /** contenido */
  readonly triggerLabel?: string;
  /** contenido */
  readonly options?: readonly DropdownOption[];
  /** decision */
  readonly selectedValue?: string;
  /** decision */
  readonly searchable?: boolean;
}

/** <synergos-kpi-card> · pieza · diccionario: Synhost.Kpi */
export interface KpiCardProps {
  /** contenido */
  readonly label?: string;
  /** contenido */
  readonly value?: string;
  /** decision */
  readonly trend?: string;
  /** contenido */
  readonly deltaLabel?: string;
  /** contenido */
  readonly period?: string;
}

/** <synergos-range-slider> · pieza */
export interface RangeSliderProps {
  /** contenido */
  readonly label?: string;
  /** decision */
  readonly min?: number;
  /** decision */
  readonly max?: number;
  /** decision */
  readonly step?: number;
  /** decision */
  readonly high?: number;
}

/** <synergos-rating-stars> · pieza */
export interface RatingStarsProps {
  /** contenido */
  readonly value?: number;
  /** decision */
  readonly max?: number;
  /** contenido */
  readonly label?: string;
}

/** <synergos-scroll-top> · pieza */
export interface ScrollTopProps {
  /** decision */
  readonly scrollThreshold?: number;
  /** decision */
  readonly position?: string;
  /** contenido */
  readonly label?: string;
}

/** <synergos-select-multi> · pieza */
export interface SelectMultiProps {
  /** contenido */
  readonly label?: string;
  /** contenido */
  readonly options?: readonly SelectMultiItem[];
  /** decision */
  readonly maxSelections?: number;
}

/** <synergos-stepper> · pieza */
export interface StepperProps {
  /** contenido */
  readonly steps?: readonly StepperItem[];
  /** decision */
  readonly currentStep?: number;
}

/** <synergos-tabs> · pieza */
export interface TabsProps {
  /** contenido */
  readonly tabs?: readonly TabsItem[];
  /** decision */
  readonly initialTab?: string;
}

/** <synergos-tag> · pieza */
export interface TagProps {
  /** contenido */
  readonly label?: string;
  /** decision */
  readonly color?: string;
}

/** <synergos-timeline> · pieza */
export interface TimelineProps {
  /** contenido */
  readonly events?: readonly TimelineEntry[];
}

export const CAROUSEL_SYNHOST: ElementoSynHost<CarouselProps> = {
  nombre: "carousel",
  tipo: "pieza",
  record: "CarouselProps",
  diccionario: [],
  campos: ["slides","autoplay","interval"],
  listas: {"slides":["src","alt","label"]},
  ejemplo: {
    "culture": "es-CO",
    "slides": [
      {
        "src": "/media/sala.jpg",
        "alt": "Sala con ventanal",
        "label": "La sala"
      },
      {
        "src": "/media/cocina.jpg",
        "alt": "Cocina integral",
        "label": "La cocina"
      }
    ],
    "autoplay": true,
    "interval": 4000
  },
};

export const DROPDOWN_SYNHOST: ElementoSynHost<DropdownProps> = {
  nombre: "dropdown",
  tipo: "pieza",
  record: "DropdownProps",
  diccionario: [],
  campos: ["triggerLabel","options","selectedValue","searchable"],
  listas: {"options":["value","label","href"]},
  ejemplo: {
    "culture": "es-CO",
    "triggerLabel": "País",
    "options": [
      {
        "value": "co",
        "label": "Colombia"
      },
      {
        "value": "mx",
        "label": "México",
        "href": "/mx"
      }
    ],
    "selectedValue": "co",
    "searchable": true
  },
};

export const KPI_CARD_SYNHOST: ElementoSynHost<KpiCardProps> = {
  nombre: "kpi-card",
  tipo: "pieza",
  record: "KpiCardProps",
  diccionario: ["Synhost.Kpi"],
  campos: ["label","value","trend","deltaLabel","period"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "label": "Ventas del mes",
    "value": "1.234",
    "trend": "up",
    "deltaLabel": "+12 %",
    "period": "vs. agosto"
  },
};

export const RANGE_SLIDER_SYNHOST: ElementoSynHost<RangeSliderProps> = {
  nombre: "range-slider",
  tipo: "pieza",
  record: "RangeSliderProps",
  diccionario: [],
  campos: ["label","min","max","step","high"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "label": "Precio por noche",
    "min": 50000,
    "max": 500000,
    "step": 10000,
    "high": 250000
  },
};

export const RATING_STARS_SYNHOST: ElementoSynHost<RatingStarsProps> = {
  nombre: "rating-stars",
  tipo: "pieza",
  record: "RatingStarsProps",
  diccionario: [],
  campos: ["value","max","label"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "value": 4,
    "max": 5,
    "label": "Valoración de los huéspedes"
  },
};

export const SCROLL_TOP_SYNHOST: ElementoSynHost<ScrollTopProps> = {
  nombre: "scroll-top",
  tipo: "pieza",
  record: "ScrollTopProps",
  diccionario: [],
  campos: ["scrollThreshold","position","label"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "scrollThreshold": 400,
    "position": "bottom-left",
    "label": "Subir al inicio"
  },
};

export const SELECT_MULTI_SYNHOST: ElementoSynHost<SelectMultiProps> = {
  nombre: "select-multi",
  tipo: "pieza",
  record: "SelectMultiProps",
  diccionario: [],
  campos: ["label","options","maxSelections"],
  listas: {"options":["value","label"]},
  ejemplo: {
    "culture": "es-CO",
    "label": "Amenidades",
    "options": [
      {
        "value": "piscina",
        "label": "Piscina"
      },
      {
        "value": "gym",
        "label": "Gimnasio"
      },
      {
        "value": "bbq",
        "label": "Zona BBQ"
      }
    ],
    "maxSelections": 2
  },
};

export const STEPPER_SYNHOST: ElementoSynHost<StepperProps> = {
  nombre: "stepper",
  tipo: "pieza",
  record: "StepperProps",
  diccionario: [],
  campos: ["steps","currentStep"],
  listas: {"steps":["title"]},
  ejemplo: {
    "culture": "es-CO",
    "steps": [
      {
        "title": "Datos"
      },
      {
        "title": "Pago"
      },
      {
        "title": "Confirmación"
      }
    ],
    "currentStep": 1
  },
};

export const TABS_SYNHOST: ElementoSynHost<TabsProps> = {
  nombre: "tabs",
  tipo: "pieza",
  record: "TabsProps",
  diccionario: [],
  campos: ["tabs","initialTab"],
  listas: {"tabs":["label","id","content"]},
  ejemplo: {
    "culture": "es-CO",
    "tabs": [
      {
        "label": "Resumen",
        "id": "resumen",
        "content": "Lo esencial de la estadía."
      },
      {
        "label": "Precios",
        "id": "precios",
        "content": "Desde $120.000 por noche."
      }
    ],
    "initialTab": "precios"
  },
};

export const TAG_SYNHOST: ElementoSynHost<TagProps> = {
  nombre: "tag",
  tipo: "pieza",
  record: "TagProps",
  diccionario: [],
  campos: ["label","color"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "label": "Oferta",
    "color": "success"
  },
};

export const TIMELINE_SYNHOST: ElementoSynHost<TimelineProps> = {
  nombre: "timeline",
  tipo: "pieza",
  record: "TimelineProps",
  diccionario: [],
  campos: ["events"],
  listas: {"events":["date","title","body"]},
  ejemplo: {
    "culture": "es-CO",
    "events": [
      {
        "date": "2019-03-01",
        "title": "Fundación",
        "body": "Abrimos la primera sede en Medellín."
      },
      {
        "date": "2024",
        "title": "Segunda sede",
        "body": "Llegamos a Bogotá."
      }
    ]
  },
};

/** Todos los elementos con contrato. Un spec exige que cada uno tenga su sanitizador ejecutado. */
export const ELEMENTOS_SYNHOST = [
  CAROUSEL_SYNHOST,
  DROPDOWN_SYNHOST,
  KPI_CARD_SYNHOST,
  RANGE_SLIDER_SYNHOST,
  RATING_STARS_SYNHOST,
  SCROLL_TOP_SYNHOST,
  SELECT_MULTI_SYNHOST,
  STEPPER_SYNHOST,
  TABS_SYNHOST,
  TAG_SYNHOST,
  TIMELINE_SYNHOST,
] as const;
