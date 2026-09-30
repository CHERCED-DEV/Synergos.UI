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

/** Parte de un record de `ElementoSynHost` (C#: AccordionSection). */
export interface AccordionSection {
  readonly title: string;
  readonly body?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: BadgeGroupItem). */
export interface BadgeGroupItem {
  readonly label: string;
  readonly tone?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: BreadcrumbStep). */
export interface BreadcrumbStep {
  readonly label: string;
  readonly href?: string;
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

/** <synergos-accordion> · pieza */
export interface AccordionProps {
  /** contenido */
  readonly items?: readonly AccordionSection[];
  /** decision */
  readonly allowMultiple?: boolean;
}

/** <synergos-badge-group> · pieza */
export interface BadgeGroupProps {
  /** contenido */
  readonly badges?: readonly BadgeGroupItem[];
  /** decision */
  readonly layout?: string;
}

/** <synergos-breadcrumb> · pieza */
export interface BreadcrumbProps {
  /** contenido */
  readonly items?: readonly BreadcrumbStep[];
  /** decision */
  readonly includeStructuredData?: boolean;
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

/** <synergos-rating-stars> · pieza */
export interface RatingStarsProps {
  /** contenido */
  readonly value?: number;
  /** decision */
  readonly max?: number;
  /** contenido */
  readonly label?: string;
}

/** <synergos-tag> · pieza */
export interface TagProps {
  /** contenido */
  readonly label?: string;
  /** decision */
  readonly color?: string;
}

export const ACCORDION_SYNHOST: ElementoSynHost<AccordionProps> = {
  nombre: "accordion",
  tipo: "pieza",
  record: "AccordionProps",
  diccionario: [],
  campos: ["items","allowMultiple"],
  listas: {"items":["title","body"]},
  ejemplo: {
    "culture": "es-CO",
    "items": [
      {
        "title": "¿Cuánto tarda el envío?",
        "body": "Entre 2 y 5 días hábiles en ciudades principales."
      },
      {
        "title": "¿Puedo devolver un producto?",
        "body": "Sí, dentro de los 30 días siguientes a la entrega."
      }
    ],
    "allowMultiple": true
  },
};

export const BADGE_GROUP_SYNHOST: ElementoSynHost<BadgeGroupProps> = {
  nombre: "badge-group",
  tipo: "pieza",
  record: "BadgeGroupProps",
  diccionario: [],
  campos: ["badges","layout"],
  listas: {"badges":["label","tone"]},
  ejemplo: {
    "culture": "es-CO",
    "badges": [
      {
        "label": "Envío gratis",
        "tone": "success"
      },
      {
        "label": "Nuevo",
        "tone": "brand"
      }
    ],
    "layout": "stack"
  },
};

export const BREADCRUMB_SYNHOST: ElementoSynHost<BreadcrumbProps> = {
  nombre: "breadcrumb",
  tipo: "pieza",
  record: "BreadcrumbProps",
  diccionario: [],
  campos: ["items","includeStructuredData"],
  listas: {"items":["label","href"]},
  ejemplo: {
    "culture": "es-CO",
    "items": [
      {
        "label": "Inicio",
        "href": "/"
      },
      {
        "label": "Tienda",
        "href": "/tienda"
      },
      {
        "label": "Zapatos"
      }
    ],
    "includeStructuredData": true
  },
};

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

/** Todos los elementos con contrato. Un spec exige que cada uno tenga su sanitizador ejecutado. */
export const ELEMENTOS_SYNHOST = [
  ACCORDION_SYNHOST,
  BADGE_GROUP_SYNHOST,
  BREADCRUMB_SYNHOST,
  CAROUSEL_SYNHOST,
  DROPDOWN_SYNHOST,
  KPI_CARD_SYNHOST,
  RATING_STARS_SYNHOST,
  TAG_SYNHOST,
] as const;
