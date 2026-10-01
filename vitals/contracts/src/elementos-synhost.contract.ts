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
  /** Las claves de uSync de esas secciones (ADR 0136): las únicas que el elemento puede pedir con `t()`. */
  readonly claves: readonly string[];
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

/** Parte de un record de `ElementoSynHost` (C#: AppDelLanzador). */
export interface AppDelLanzador {
  readonly name: string;
  readonly id?: string;
  readonly tagline?: string;
  readonly icon?: string;
  readonly status?: string;
  readonly industry?: string;
  readonly persona?: string;
  readonly capabilities?: readonly string[];
  readonly url?: string;
  readonly demoMode?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: AvatarGroupMember). */
export interface AvatarGroupMember {
  readonly name?: string;
  readonly src?: string;
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

/** Parte de un record de `ElementoSynHost` (C#: ChartBarEntry). */
export interface ChartBarEntry {
  readonly label: string;
  readonly value: number;
}

/** Parte de un record de `ElementoSynHost` (C#: ColorSwatchesItem). */
export interface ColorSwatchesItem {
  readonly color: string;
  readonly label?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: DropdownOption). */
export interface DropdownOption {
  readonly value: string;
  readonly label: string;
  readonly href?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: LightboxGalleryImage). */
export interface LightboxGalleryImage {
  readonly src: string;
  readonly thumb?: string;
  readonly alt?: string;
  readonly caption?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: MapPinItem). */
export interface MapPinItem {
  readonly lat: number;
  readonly lng: number;
  readonly label?: string;
  readonly description?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: NotificationToastSeed). */
export interface NotificationToastSeed {
  readonly message: string;
  readonly variant?: string;
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

/** Parte de un record de `ElementoSynHost` (C#: TourGuideStep). */
export interface TourGuideStep {
  readonly target?: string;
  readonly title?: string;
  readonly body?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: TreeViewNode). */
export interface TreeViewNode {
  readonly label: string;
  readonly children?: readonly TreeViewNode[];
}

/** <synergos-accordion> · pieza */
export interface AccordionProps {
  /** contenido */
  readonly items?: readonly AccordionSection[];
  /** decision */
  readonly allowMultiple?: boolean;
}

/** <synergos-app-launcher> · funcionalidad · diccionario: AppLauncher, Common.States */
export interface AppLauncherProps {
  /** contenido */
  readonly title?: string;
  /** contenido */
  readonly subtitle?: string;
  /** contenido */
  readonly apps?: readonly AppDelLanzador[];
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

/** <synergos-avatar> · pieza · diccionario: Avatar */
export interface AvatarProps {
  /** contenido */
  readonly src?: string;
  /** contenido */
  readonly alt?: string;
}

/** <synergos-avatar-group> · pieza · diccionario: AvatarGroup, Avatar */
export interface AvatarGroupProps {
  /** contenido */
  readonly avatars?: readonly AvatarGroupMember[];
  /** decision */
  readonly maxVisible?: number;
  /** contenido */
  readonly label?: string;
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
}

/** <synergos-carousel> · pieza · diccionario: Slider */
export interface CarouselProps {
  /** contenido */
  readonly slides?: readonly CarouselSlide[];
  /** decision */
  readonly autoplay?: boolean;
  /** decision */
  readonly interval?: number;
}

/** <synergos-chart-bar> · pieza · diccionario: ChartBar */
export interface ChartBarProps {
  /** contenido */
  readonly title?: string;
  /** decision */
  readonly orientation?: string;
  /** contenido */
  readonly data?: readonly ChartBarEntry[];
}

/** <synergos-color-picker> · pieza */
export interface ColorPickerProps {
  /** contenido */
  readonly label?: string;
  /** decision */
  readonly initialColor?: string;
  /** contenido */
  readonly palette?: readonly string[];
}

/** <synergos-color-swatches> · pieza */
export interface ColorSwatchesProps {
  /** contenido */
  readonly swatches?: readonly ColorSwatchesItem[];
  /** decision */
  readonly shape?: string;
}

/** <synergos-cookie-consent> · pieza */
export interface CookieConsentProps {
  /** contenido */
  readonly bannerText?: string;
  /** contenido */
  readonly acceptLabel?: string;
  /** contenido */
  readonly rejectLabel?: string;
  /** contenido */
  readonly settingsLabel?: string;
  /** contenido */
  readonly policyLink?: string;
  /** contenido */
  readonly policyLabel?: string;
}

/** <synergos-countdown-clock> · pieza */
export interface CountdownClockProps {
  /** contenido */
  readonly targetDate?: string;
}

/** <synergos-countdown-digital> · pieza */
export interface CountdownDigitalProps {
  /** contenido */
  readonly targetDate?: string;
  /** decision */
  readonly showLabels?: boolean;
  /** decision */
  readonly style?: string;
}

/** <synergos-dropdown> · pieza · diccionario: Dropdown, Common.States */
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

/** <synergos-fab> · pieza */
export interface FabProps {
  /** decision */
  readonly iconKey?: string;
  /** contenido */
  readonly actionLink?: string;
  /** decision */
  readonly target?: string;
  /** decision */
  readonly position?: string;
  /** contenido */
  readonly label?: string;
}

/** <synergos-hero-banner> · pieza · diccionario: Synhost.Hero */
export interface HeroBannerProps {
  /** contenido */
  readonly title?: string;
  /** contenido */
  readonly subtitle?: string;
  /** contenido */
  readonly media?: string;
  /** contenido */
  readonly mediaAlt?: string;
  /** contenido */
  readonly ctaLabel?: string;
  /** contenido */
  readonly ctaLink?: string;
}

/** <synergos-icon-label> · pieza */
export interface IconLabelProps {
  /** decision */
  readonly iconName?: string;
  /** contenido */
  readonly labelText?: string;
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

/** <synergos-lightbox-gallery> · pieza · diccionario: Gallery */
export interface LightboxGalleryProps {
  /** contenido */
  readonly images?: readonly LightboxGalleryImage[];
  /** decision */
  readonly columns?: number;
}

/** <synergos-map-pin> · pieza · diccionario: Map, Common.Actions */
export interface MapPinProps {
  /** decision */
  readonly centerLat?: number;
  /** decision */
  readonly centerLng?: number;
  /** decision */
  readonly zoomLevel?: number;
  /** contenido */
  readonly pins?: readonly MapPinItem[];
}

/** <synergos-notification-toast> · pieza */
export interface NotificationToastProps {
  /** contenido */
  readonly toasts?: readonly NotificationToastSeed[];
  /** decision */
  readonly durationMs?: number;
}

/** <synergos-progress-bar> · pieza */
export interface ProgressBarProps {
  /** contenido */
  readonly value?: number;
  /** decision */
  readonly max?: number;
  /** contenido */
  readonly label?: string;
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

/** <synergos-rating-stars> · pieza · diccionario: Rating */
export interface RatingStarsProps {
  /** contenido */
  readonly value?: number;
  /** decision */
  readonly max?: number;
  /** contenido */
  readonly label?: string;
}

/** <synergos-rich-tooltip> · pieza */
export interface RichTooltipProps {
  /** contenido */
  readonly triggerText?: string;
  /** contenido */
  readonly body?: string;
  /** decision */
  readonly placement?: string;
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

/** <synergos-select-multi> · pieza · diccionario: SelectMulti, Common.States */
export interface SelectMultiProps {
  /** contenido */
  readonly label?: string;
  /** contenido */
  readonly options?: readonly SelectMultiItem[];
  /** decision */
  readonly maxSelections?: number;
}

/** <synergos-share-bar> · pieza · diccionario: Share */
export interface ShareBarProps {
  /** decision */
  readonly platforms?: readonly string[];
  /** contenido */
  readonly shareLink?: string;
  /** contenido */
  readonly shareTitle?: string;
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

/** <synergos-tag> · pieza · diccionario: Tag */
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

/** <synergos-tour-guide> · pieza · diccionario: TourGuide, Common.Actions */
export interface TourGuideProps {
  /** contenido */
  readonly steps?: readonly TourGuideStep[];
  /** decision */
  readonly autoStart?: boolean;
}

/** <synergos-tree-view> · pieza */
export interface TreeViewProps {
  /** contenido */
  readonly tree?: readonly TreeViewNode[];
  /** decision */
  readonly expandAll?: boolean;
  /** contenido */
  readonly label?: string;
}

/** <synergos-video-player> · pieza */
export interface VideoPlayerProps {
  /** contenido */
  readonly videoFile?: string;
  /** contenido */
  readonly posterImage?: string;
}

export const ACCORDION_SYNHOST: ElementoSynHost<AccordionProps> = {
  nombre: "accordion",
  tipo: "pieza",
  record: "AccordionProps",
  diccionario: [],
  claves: [],
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

export const APP_LAUNCHER_SYNHOST: ElementoSynHost<AppLauncherProps> = {
  nombre: "app-launcher",
  tipo: "funcionalidad",
  record: "AppLauncherProps",
  diccionario: ["AppLauncher","Common.States"],
  claves: ["AppLauncher.Capabilities","AppLauncher.Count.Filtered","AppLauncher.Count.One","AppLauncher.Count.Other","AppLauncher.EmbedPreview","AppLauncher.Empty","AppLauncher.Filters.All","AppLauncher.Filters.Aria","AppLauncher.Filters.Capability","AppLauncher.Filters.Industry","AppLauncher.Filters.Persona","AppLauncher.Open","AppLauncher.Search.Label","AppLauncher.Search.Placeholder","AppLauncher.Status.Aria","AppLauncher.Status.Beta","AppLauncher.Status.Live","AppLauncher.Title","Common.States.ComingSoon","Common.States.Error","Common.States.Loading","Common.States.New","Common.States.NoResults","Common.States.NotAvailable","Common.States.Optional","Common.States.Required","Common.States.Success"],
  campos: ["title","subtitle","apps"],
  listas: {"apps":["name","id","tagline","icon","status","industry","persona","capabilities","url","demoMode"]},
  ejemplo: {
    "culture": "es-CO",
    "title": "Explora las apps",
    "subtitle": "Un motor, muchos productos",
    "apps": [
      {
        "name": "Tienda",
        "id": "tienda",
        "tagline": "Catálogo, carrito y checkout.",
        "icon": "bag",
        "status": "live",
        "industry": "Retail",
        "persona": "Comprador",
        "capabilities": [
          "Catálogo",
          "Pagos"
        ],
        "url": "/tienda",
        "demoMode": "deeplink"
      },
      {
        "name": "Gobierno",
        "id": "gobierno",
        "status": "soon",
        "industry": "Sector público",
        "persona": "Ciudadano",
        "capabilities": [
          "Trámites",
          "Citas"
        ],
        "url": "/gobierno",
        "demoMode": "embed"
      }
    ]
  },
};

export const AUDIO_PLAYER_SYNHOST: ElementoSynHost<AudioPlayerProps> = {
  nombre: "audio-player",
  tipo: "pieza",
  record: "AudioPlayerProps",
  diccionario: [],
  claves: [],
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
  diccionario: ["Avatar"],
  claves: ["Avatar.Fallback","Avatar.Status.Away","Avatar.Status.Busy","Avatar.Status.Offline","Avatar.Status.Online"],
  campos: ["src","alt"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "src": "/media/equipo/ana-gomez.jpg",
    "alt": "Ana Gómez, directora de producto"
  },
};

export const AVATAR_GROUP_SYNHOST: ElementoSynHost<AvatarGroupProps> = {
  nombre: "avatar-group",
  tipo: "pieza",
  record: "AvatarGroupProps",
  diccionario: ["AvatarGroup","Avatar"],
  claves: ["Avatar.Fallback","Avatar.Status.Away","Avatar.Status.Busy","Avatar.Status.Offline","Avatar.Status.Online","AvatarGroup.Count.One","AvatarGroup.Count.Other","AvatarGroup.Empty","AvatarGroup.Label","AvatarGroup.More","AvatarGroup.Rest"],
  campos: ["avatars","maxVisible","label"],
  listas: {"avatars":["name","src"]},
  ejemplo: {
    "culture": "es-CO",
    "avatars": [
      {
        "name": "Ana Gómez",
        "src": "/media/equipo/ana-gomez.jpg"
      },
      {
        "name": "Luis Pardo",
        "src": "/media/equipo/luis-pardo.jpg"
      },
      {
        "name": "Marta Ruiz"
      }
    ],
    "maxVisible": 2,
    "label": "Equipo directivo"
  },
};

export const BADGE_GROUP_SYNHOST: ElementoSynHost<BadgeGroupProps> = {
  nombre: "badge-group",
  tipo: "pieza",
  record: "BadgeGroupProps",
  diccionario: [],
  claves: [],
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
  claves: [],
  campos: ["items"],
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
    ]
  },
};

export const CAROUSEL_SYNHOST: ElementoSynHost<CarouselProps> = {
  nombre: "carousel",
  tipo: "pieza",
  record: "CarouselProps",
  diccionario: ["Slider"],
  claves: ["Slider.Aria","Slider.Current","Slider.GoToSlide","Slider.Next","Slider.Pager","Slider.Pause","Slider.Play","Slider.Previous","Slider.SlideOf"],
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

export const CHART_BAR_SYNHOST: ElementoSynHost<ChartBarProps> = {
  nombre: "chart-bar",
  tipo: "pieza",
  record: "ChartBarProps",
  diccionario: ["ChartBar"],
  claves: ["ChartBar.Aria","ChartBar.Category","ChartBar.Empty","ChartBar.Summary.One","ChartBar.Summary.Other","ChartBar.Value"],
  campos: ["title","orientation","data"],
  listas: {"data":["label","value"]},
  ejemplo: {
    "culture": "es-CO",
    "title": "Afiliados nuevos por trimestre",
    "orientation": "horizontal",
    "data": [
      {
        "label": "T1",
        "value": 1200
      },
      {
        "label": "T2",
        "value": 1845300
      },
      {
        "label": "T3",
        "value": 950.5
      }
    ]
  },
};

export const COLOR_PICKER_SYNHOST: ElementoSynHost<ColorPickerProps> = {
  nombre: "color-picker",
  tipo: "pieza",
  record: "ColorPickerProps",
  diccionario: [],
  claves: [],
  campos: ["label","initialColor","palette"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "label": "Color de acento de tu tienda",
    "initialColor": "#0f766e",
    "palette": [
      "#0f766e",
      "#b45309",
      "#7c3aed",
      "#be123c"
    ]
  },
};

export const COLOR_SWATCHES_SYNHOST: ElementoSynHost<ColorSwatchesProps> = {
  nombre: "color-swatches",
  tipo: "pieza",
  record: "ColorSwatchesProps",
  diccionario: [],
  claves: [],
  campos: ["swatches","shape"],
  listas: {"swatches":["color","label"]},
  ejemplo: {
    "culture": "es-CO",
    "swatches": [
      {
        "color": "#1e3a8a",
        "label": "Azul noche"
      },
      {
        "color": "#f97316",
        "label": "Naranja"
      }
    ],
    "shape": "circle"
  },
};

export const COOKIE_CONSENT_SYNHOST: ElementoSynHost<CookieConsentProps> = {
  nombre: "cookie-consent",
  tipo: "pieza",
  record: "CookieConsentProps",
  diccionario: [],
  claves: [],
  campos: ["bannerText","acceptLabel","rejectLabel","settingsLabel","policyLink","policyLabel"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "bannerText": "Usamos cookies propias y de terceros para medir el uso del sitio.",
    "acceptLabel": "Acepto todas",
    "rejectLabel": "Sólo las necesarias",
    "settingsLabel": "Elegir cuáles",
    "policyLink": "/privacidad",
    "policyLabel": "Política de privacidad"
  },
};

export const COUNTDOWN_CLOCK_SYNHOST: ElementoSynHost<CountdownClockProps> = {
  nombre: "countdown-clock",
  tipo: "pieza",
  record: "CountdownClockProps",
  diccionario: [],
  claves: [],
  campos: ["targetDate"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "targetDate": "2030-12-31T23:59:59-05:00"
  },
};

export const COUNTDOWN_DIGITAL_SYNHOST: ElementoSynHost<CountdownDigitalProps> = {
  nombre: "countdown-digital",
  tipo: "pieza",
  record: "CountdownDigitalProps",
  diccionario: [],
  claves: [],
  campos: ["targetDate","showLabels","style"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "targetDate": "2030-12-31T23:59:59-05:00",
    "showLabels": true,
    "style": "plain"
  },
};

export const DROPDOWN_SYNHOST: ElementoSynHost<DropdownProps> = {
  nombre: "dropdown",
  tipo: "pieza",
  record: "DropdownProps",
  diccionario: ["Dropdown","Common.States"],
  claves: ["Common.States.ComingSoon","Common.States.Error","Common.States.Loading","Common.States.New","Common.States.NoResults","Common.States.NotAvailable","Common.States.Optional","Common.States.Required","Common.States.Success","Dropdown.Filter","Dropdown.Search","Dropdown.Trigger"],
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

export const FAB_SYNHOST: ElementoSynHost<FabProps> = {
  nombre: "fab",
  tipo: "pieza",
  record: "FabProps",
  diccionario: [],
  claves: [],
  campos: ["iconKey","actionLink","target","position","label"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "iconKey": "whatsapp",
    "actionLink": "https://wa.me/573001234567",
    "target": "_blank",
    "position": "bottom-left",
    "label": "Escribinos por WhatsApp"
  },
};

export const HERO_BANNER_SYNHOST: ElementoSynHost<HeroBannerProps> = {
  nombre: "hero-banner",
  tipo: "pieza",
  record: "HeroBannerProps",
  diccionario: ["Synhost.Hero"],
  claves: ["Synhost.Hero.Aria"],
  campos: ["title","subtitle","media","mediaAlt","ctaLabel","ctaLink"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "title": "Viví el Caribe colombiano",
    "subtitle": "Temporada 2026: vuelos y hoteles con el 20 % de descuento",
    "media": "/media/hero/playa-palomino.jpg",
    "mediaAlt": "Playa de Palomino al atardecer",
    "ctaLabel": "Reservar ahora",
    "ctaLink": "/reservas"
  },
};

export const ICON_LABEL_SYNHOST: ElementoSynHost<IconLabelProps> = {
  nombre: "icon-label",
  tipo: "pieza",
  record: "IconLabelProps",
  diccionario: [],
  claves: [],
  campos: ["iconName","labelText"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "iconName": "check",
    "labelText": "Envío gratis a todo el país"
  },
};

export const KPI_CARD_SYNHOST: ElementoSynHost<KpiCardProps> = {
  nombre: "kpi-card",
  tipo: "pieza",
  record: "KpiCardProps",
  diccionario: ["Synhost.Kpi"],
  claves: ["Synhost.Kpi.Aria","Synhost.Kpi.NoData","Synhost.Kpi.Sparkline","Synhost.Kpi.Trend.Down","Synhost.Kpi.Trend.Flat","Synhost.Kpi.Trend.Up"],
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

export const LIGHTBOX_GALLERY_SYNHOST: ElementoSynHost<LightboxGalleryProps> = {
  nombre: "lightbox-gallery",
  tipo: "pieza",
  record: "LightboxGalleryProps",
  diccionario: ["Gallery"],
  claves: ["Gallery.Aria","Gallery.Close","Gallery.Download","Gallery.Empty","Gallery.Enlarge","Gallery.Enlarged","Gallery.ImageOf","Gallery.Next","Gallery.Previous","Gallery.Zoom"],
  campos: ["images","columns"],
  listas: {"images":["src","thumb","alt","caption"]},
  ejemplo: {
    "culture": "es-CO",
    "images": [
      {
        "src": "/media/casa/sala.jpg",
        "thumb": "/media/casa/sala-t.jpg",
        "alt": "Sala con ventanal",
        "caption": "La sala"
      },
      {
        "src": "/media/casa/cocina.jpg",
        "thumb": "/media/casa/cocina-t.jpg",
        "alt": "Cocina integral",
        "caption": "La cocina"
      }
    ],
    "columns": 2
  },
};

export const MAP_PIN_SYNHOST: ElementoSynHost<MapPinProps> = {
  nombre: "map-pin",
  tipo: "pieza",
  record: "MapPinProps",
  diccionario: ["Map","Common.Actions"],
  claves: ["Common.Actions.Back","Common.Actions.Close","Common.Actions.Collapse","Common.Actions.ContactUs","Common.Actions.Download","Common.Actions.Expand","Common.Actions.GetDirections","Common.Actions.GetStarted","Common.Actions.LearnMore","Common.Actions.Next","Common.Actions.Open","Common.Actions.Previous","Common.Actions.ReadMore","Common.Actions.SeeMore","Common.Actions.Share","Common.Actions.ViewAll","Map.Aria","Map.CenteredOn","Map.Error","Map.GetDirections","Map.Loading","Map.MoreAbout","Map.Pin","Map.Pins","Map.ViewLarger"],
  campos: ["centerLat","centerLng","zoomLevel","pins"],
  listas: {"pins":["lat","lng","label","description"]},
  ejemplo: {
    "culture": "es-CO",
    "centerLat": 4.711,
    "centerLng": -74.0721,
    "zoomLevel": 12,
    "pins": [
      {
        "lat": 4.6097,
        "lng": -74.0817,
        "label": "Oficina Bogotá",
        "description": "Carrera 7 # 71-21, piso 12"
      },
      {
        "lat": 6.2518,
        "lng": -75.5636,
        "label": "Oficina Medellín",
        "description": "El Poblado"
      }
    ]
  },
};

export const NOTIFICATION_TOAST_SYNHOST: ElementoSynHost<NotificationToastProps> = {
  nombre: "notification-toast",
  tipo: "pieza",
  record: "NotificationToastProps",
  diccionario: [],
  claves: [],
  campos: ["toasts","durationMs"],
  listas: {"toasts":["message","variant"]},
  ejemplo: {
    "culture": "es-CO",
    "toasts": [
      {
        "message": "Tu pedido quedó confirmado.",
        "variant": "success"
      }
    ],
    "durationMs": 8000
  },
};

export const PROGRESS_BAR_SYNHOST: ElementoSynHost<ProgressBarProps> = {
  nombre: "progress-bar",
  tipo: "pieza",
  record: "ProgressBarProps",
  diccionario: [],
  claves: [],
  campos: ["value","max","label"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "value": 3,
    "max": 5,
    "label": "Pasos completados del registro"
  },
};

export const RANGE_SLIDER_SYNHOST: ElementoSynHost<RangeSliderProps> = {
  nombre: "range-slider",
  tipo: "pieza",
  record: "RangeSliderProps",
  diccionario: [],
  claves: [],
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
  diccionario: ["Rating"],
  claves: ["Rating.AlreadyRated","Rating.Average","Rating.SelectStars","Rating.Stars.Aria","Rating.Submit","Rating.Success"],
  campos: ["value","max","label"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "value": 4,
    "max": 5,
    "label": "Valoración de los huéspedes"
  },
};

export const RICH_TOOLTIP_SYNHOST: ElementoSynHost<RichTooltipProps> = {
  nombre: "rich-tooltip",
  tipo: "pieza",
  record: "RichTooltipProps",
  diccionario: [],
  claves: [],
  campos: ["triggerText","body","placement"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "triggerText": "Cuota de manejo",
    "body": "Cobro mensual por administrar la tarjeta. Se exonera con compras desde $ 300.000.",
    "placement": "bottom"
  },
};

export const SCROLL_TOP_SYNHOST: ElementoSynHost<ScrollTopProps> = {
  nombre: "scroll-top",
  tipo: "pieza",
  record: "ScrollTopProps",
  diccionario: [],
  claves: [],
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
  diccionario: ["SelectMulti","Common.States"],
  claves: ["Common.States.ComingSoon","Common.States.Error","Common.States.Loading","Common.States.New","Common.States.NoResults","Common.States.NotAvailable","Common.States.Optional","Common.States.Required","Common.States.Success","SelectMulti.Capacity","SelectMulti.Clear","SelectMulti.Options","SelectMulti.Placeholder","SelectMulti.Remove","SelectMulti.Search","SelectMulti.Selected.One","SelectMulti.Selected.Other","SelectMulti.Selection"],
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

export const SHARE_BAR_SYNHOST: ElementoSynHost<ShareBarProps> = {
  nombre: "share-bar",
  tipo: "pieza",
  record: "ShareBarProps",
  diccionario: ["Share"],
  claves: ["Share.Copied","Share.Copy","Share.CopyFailed","Share.Email","Share.Label","Share.On"],
  campos: ["platforms","shareLink","shareTitle"],
  listas: {},
  ejemplo: {
    "culture": "es-CO",
    "platforms": [
      "whatsapp",
      "x",
      "linkedin"
    ],
    "shareLink": "https://synergos.local/eventos/feria-del-libro-2026",
    "shareTitle": "Feria del libro 2026: programa completo"
  },
};

export const STEPPER_SYNHOST: ElementoSynHost<StepperProps> = {
  nombre: "stepper",
  tipo: "pieza",
  record: "StepperProps",
  diccionario: [],
  claves: [],
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
  claves: [],
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
  diccionario: ["Tag"],
  claves: ["Tag.Remove"],
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
  claves: [],
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

export const TOUR_GUIDE_SYNHOST: ElementoSynHost<TourGuideProps> = {
  nombre: "tour-guide",
  tipo: "pieza",
  record: "TourGuideProps",
  diccionario: ["TourGuide","Common.Actions"],
  claves: ["Common.Actions.Back","Common.Actions.Close","Common.Actions.Collapse","Common.Actions.ContactUs","Common.Actions.Download","Common.Actions.Expand","Common.Actions.GetDirections","Common.Actions.GetStarted","Common.Actions.LearnMore","Common.Actions.Next","Common.Actions.Open","Common.Actions.Previous","Common.Actions.ReadMore","Common.Actions.SeeMore","Common.Actions.Share","Common.Actions.ViewAll","TourGuide.Done","TourGuide.Skip"],
  campos: ["steps","autoStart"],
  listas: {"steps":["target","title","body"]},
  ejemplo: {
    "culture": "es-CO",
    "steps": [
      {
        "target": ".site-header",
        "title": "Bienvenido",
        "body": "Este es el menú principal."
      },
      {
        "target": "#buscar",
        "title": "Buscá",
        "body": "Encontrá cualquier cosa desde acá."
      }
    ],
    "autoStart": true
  },
};

export const TREE_VIEW_SYNHOST: ElementoSynHost<TreeViewProps> = {
  nombre: "tree-view",
  tipo: "pieza",
  record: "TreeViewProps",
  diccionario: [],
  claves: [],
  campos: ["tree","expandAll","label"],
  listas: {"tree":["label","children"]},
  ejemplo: {
    "culture": "es-CO",
    "tree": [
      {
        "label": "Productos",
        "children": [
          {
            "label": "Hogar",
            "children": [
              {
                "label": "Cocina"
              }
            ]
          },
          {
            "label": "Jardín"
          }
        ]
      },
      {
        "label": "Servicios"
      }
    ],
    "expandAll": true,
    "label": "Catálogo de la tienda"
  },
};

export const VIDEO_PLAYER_SYNHOST: ElementoSynHost<VideoPlayerProps> = {
  nombre: "video-player",
  tipo: "pieza",
  record: "VideoPlayerProps",
  diccionario: [],
  claves: [],
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
  ACCORDION_SYNHOST,
  APP_LAUNCHER_SYNHOST,
  AUDIO_PLAYER_SYNHOST,
  AVATAR_SYNHOST,
  AVATAR_GROUP_SYNHOST,
  BADGE_GROUP_SYNHOST,
  BREADCRUMB_SYNHOST,
  CAROUSEL_SYNHOST,
  CHART_BAR_SYNHOST,
  COLOR_PICKER_SYNHOST,
  COLOR_SWATCHES_SYNHOST,
  COOKIE_CONSENT_SYNHOST,
  COUNTDOWN_CLOCK_SYNHOST,
  COUNTDOWN_DIGITAL_SYNHOST,
  DROPDOWN_SYNHOST,
  FAB_SYNHOST,
  HERO_BANNER_SYNHOST,
  ICON_LABEL_SYNHOST,
  KPI_CARD_SYNHOST,
  LIGHTBOX_GALLERY_SYNHOST,
  MAP_PIN_SYNHOST,
  NOTIFICATION_TOAST_SYNHOST,
  PROGRESS_BAR_SYNHOST,
  RANGE_SLIDER_SYNHOST,
  RATING_STARS_SYNHOST,
  RICH_TOOLTIP_SYNHOST,
  SCROLL_TOP_SYNHOST,
  SELECT_MULTI_SYNHOST,
  SHARE_BAR_SYNHOST,
  STEPPER_SYNHOST,
  TABS_SYNHOST,
  TAG_SYNHOST,
  TIMELINE_SYNHOST,
  TOUR_GUIDE_SYNHOST,
  TREE_VIEW_SYNHOST,
  VIDEO_PLAYER_SYNHOST,
] as const;
