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

/** <synergos-audio-player> · pieza */
export interface AudioPlayerProps {
  /** contenido */
  readonly audioFile?: string;
  /** contenido */
  readonly trackTitle?: string;
  /** contenido */
  readonly artistName?: string;
}

/** <synergos-avatar> · pieza */
export interface AvatarProps {
  /** contenido */
  readonly src?: string;
  /** contenido */
  readonly alt?: string;
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

/** <synergos-video-player> · pieza */
export interface VideoPlayerProps {
  /** contenido */
  readonly videoFile?: string;
  /** contenido */
  readonly posterImage?: string;
}

export const AUDIO_PLAYER_SYNHOST: ElementoSynHost<AudioPlayerProps> = {
  nombre: "audio-player",
  tipo: "pieza",
  record: "AudioPlayerProps",
  diccionario: [],
  campos: ["audioFile","trackTitle","artistName"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "audioFile": "/media/podcast/episodio-12.mp3",
    "trackTitle": "Episodio 12: la ciudad que camina",
    "artistName": "Radio Synergos"
  },
};

export const AVATAR_SYNHOST: ElementoSynHost<AvatarProps> = {
  nombre: "avatar",
  tipo: "pieza",
  record: "AvatarProps",
  diccionario: [],
  campos: ["src","alt"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "src": "/media/equipo/ana-gomez.jpg",
    "alt": "Ana Gómez, directora de producto"
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

export const VIDEO_PLAYER_SYNHOST: ElementoSynHost<VideoPlayerProps> = {
  nombre: "video-player",
  tipo: "pieza",
  record: "VideoPlayerProps",
  diccionario: [],
  campos: ["videoFile","posterImage"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "videoFile": "/media/propiedades/recorrido-casa-lago.mp4",
    "posterImage": "/media/propiedades/casa-lago-fachada.jpg"
  },
};

/** Todos los elementos con contrato. Un spec exige que cada uno tenga su sanitizador ejecutado. */
export const ELEMENTOS_SYNHOST = [
  AUDIO_PLAYER_SYNHOST,
  AVATAR_SYNHOST,
  CAROUSEL_SYNHOST,
  DROPDOWN_SYNHOST,
  KPI_CARD_SYNHOST,
  RATING_STARS_SYNHOST,
  TAG_SYNHOST,
  VIDEO_PLAYER_SYNHOST,
] as const;
