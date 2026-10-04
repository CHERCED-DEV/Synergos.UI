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

/** Un prevalor que el editor elige, y lo que de él llega al elemento DESPUÉS del resolver (`null`: nada). */
export interface ValorDeSelectorSynHost {
  readonly editor: string;
  readonly viaja: string | null;
}

/**
 * Un selector del ElementType (desplegable, radios, casillas) y dónde cae en el `config`:
 * `'position'`, `'platforms[]'`, `'toasts[].variant'`; `null` si no llega al elemento (CMS#181).
 */
export interface SelectorSynHost {
  readonly propiedad: string;
  readonly dataType: string;
  readonly multiple: boolean;
  readonly campo: string | null;
  readonly valores: readonly ValorDeSelectorSynHost[];
  /** Elige DATOS (la fuente de un listado), no vocabulario: el gate no lo cruza (CMS#196). */
  readonly deDatos?: true;
}

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
  /** Lo que el editor puede elegir en sus selectores, pasado por el resolver (CMS#181). */
  readonly selectores: readonly SelectorSynHost[];
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

/** Parte de un record de `ElementoSynHost` (C#: CampoDelFormulario). */
export interface CampoDelFormulario {
  readonly name: string;
  readonly label: string;
  readonly type: string;
  readonly required: boolean;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly options?: readonly string[];
}

/** Parte de un record de `ElementoSynHost` (C#: CarouselSlide). */
export interface CarouselSlide {
  readonly src: string;
  readonly alt?: string;
  readonly label?: string;
  readonly linkUrl?: string;
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

/** Parte de un record de `ElementoSynHost` (C#: DatoDeLaFila). */
export interface DatoDeLaFila {
  readonly label: string;
  readonly value: string;
}

/** Parte de un record de `ElementoSynHost` (C#: DropdownOption). */
export interface DropdownOption {
  readonly value: string;
  readonly label: string;
  readonly href?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: FilaDelListado). */
export interface FilaDelListado {
  readonly id: string;
  readonly title: string;
  readonly href?: string;
  readonly image?: string;
  readonly imageAlt?: string;
  readonly badge?: string;
  readonly specs?: readonly DatoDeLaFila[];
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

/** Parte de un record de `ElementoSynHost` (C#: PasoDelFormulario). */
export interface PasoDelFormulario {
  readonly title: string;
  readonly fields: readonly CampoDelFormulario[];
  readonly description?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: SelectMultiItem). */
export interface SelectMultiItem {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/** Parte de un record de `ElementoSynHost` (C#: StepperItem). */
export interface StepperItem {
  readonly title: string;
  readonly description?: string;
  readonly id?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: TabsItem). */
export interface TabsItem {
  readonly label: string;
  readonly id?: string;
  readonly content?: string;
  readonly disabled?: boolean;
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
  readonly placement?: string;
}

/** Parte de un record de `ElementoSynHost` (C#: TreeViewNode). */
export interface TreeViewNode {
  readonly label: string;
  readonly children?: readonly TreeViewNode[];
  readonly id?: string;
  readonly href?: string;
  readonly icon?: string;
  readonly expanded?: boolean;
}

/** <synergos-academy> · funcionalidad */
export interface AcademyProps {
  /** contenido */
  readonly heading?: string;
  /** contenido */
  readonly subheading?: string;
  /** negocio */
  readonly apiBase: string;
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

/** <synergos-audio-player> · pieza · diccionario: Media, Audio */
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

/** <synergos-badge-group> · pieza · diccionario: BadgeGroup */
export interface BadgeGroupProps {
  /** contenido */
  readonly badges?: readonly BadgeGroupItem[];
  /** decision */
  readonly layout?: string;
}

/** <synergos-blogs> · funcionalidad */
export interface BlogsProps {
  /** contenido */
  readonly heading?: string;
  /** contenido */
  readonly subheading?: string;
  /** negocio */
  readonly apiBase: string;
}

/** <synergos-booking-wizard> · funcionalidad */
export interface BookingWizardProps {
  /** contenido */
  readonly destinationLabel?: string;
  /** negocio */
  readonly apiBase: string;
}

/** <synergos-breadcrumb> · pieza · diccionario: Nav.Breadcrumb */
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

/** <synergos-color-picker> · pieza · diccionario: ColorPicker */
export interface ColorPickerProps {
  /** contenido */
  readonly label?: string;
  /** decision */
  readonly initialColor?: string;
  /** contenido */
  readonly palette?: readonly string[];
}

/** <synergos-color-swatches> · pieza · diccionario: ColorSwatches */
export interface ColorSwatchesProps {
  /** contenido */
  readonly swatches?: readonly ColorSwatchesItem[];
  /** decision */
  readonly shape?: string;
}

/** <synergos-cookie-consent> · pieza · diccionario: Cookie */
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

/** <synergos-countdown-clock> · pieza · diccionario: Countdown */
export interface CountdownClockProps {
  /** contenido */
  readonly targetDate?: string;
}

/** <synergos-countdown-digital> · pieza · diccionario: Countdown */
export interface CountdownDigitalProps {
  /** contenido */
  readonly targetDate?: string;
  /** decision */
  readonly showLabels?: boolean;
  /** decision */
  readonly style?: string;
}

/** <synergos-data-grid> · pieza · diccionario: DataGrid */
export interface DataGridProps {
  /** contenido */
  readonly rows?: readonly FilaDelListado[];
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

/** <synergos-ehr> · funcionalidad */
export interface EhrProps {
  /** negocio */
  readonly apiBase: string;
}

/** <synergos-eventos> · funcionalidad */
export interface EventosProps {
  /** contenido */
  readonly heading?: string;
  /** contenido */
  readonly subheading?: string;
  /** decision */
  readonly role?: string;
  /** negocio */
  readonly apiBase: string;
  /** negocio */
  readonly feePercent: number;
  /** negocio */
  readonly platformFeePercent: number;
}

/** <synergos-fab> · pieza · diccionario: Fab */
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

/** <synergos-form-stepper> · funcionalidad · diccionario: Form.Messages, Form.Actions, Form.Validation.Required, Form.Placeholders.SelectOption, Form.Submit */
export interface FormStepperProps {
  /** contenido */
  readonly formKey?: string;
  /** contenido */
  readonly steps?: readonly PasoDelFormulario[];
  /** decision */
  readonly allowSkip?: boolean;
  /** negocio */
  readonly apiBase: string;
  /** negocio */
  readonly honeypotField: string;
}

/** <synergos-gov> · funcionalidad */
export interface GovProps {
  /** contenido */
  readonly heading?: string;
  /** contenido */
  readonly subheading?: string;
  /** negocio */
  readonly apiBase: string;
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

/** <synergos-notification-toast> · pieza · diccionario: Notification */
export interface NotificationToastProps {
  /** contenido */
  readonly toasts?: readonly NotificationToastSeed[];
  /** decision */
  readonly durationMs?: number;
}

/** <synergos-progress-bar> · pieza · diccionario: ProgressBar */
export interface ProgressBarProps {
  /** contenido */
  readonly value?: number;
  /** decision */
  readonly max?: number;
  /** contenido */
  readonly label?: string;
}

/** <synergos-range-slider> · pieza · diccionario: RangeSlider */
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

/** <synergos-realty> · funcionalidad */
export interface RealtyProps {
  /** contenido */
  readonly heading?: string;
  /** contenido */
  readonly subheading?: string;
  /** negocio */
  readonly apiBase: string;
  /** negocio */
  readonly defaultRatePercent: number;
}

/** <synergos-rich-tooltip> · pieza · diccionario: Common.Actions */
export interface RichTooltipProps {
  /** contenido */
  readonly triggerText?: string;
  /** contenido */
  readonly body?: string;
  /** decision */
  readonly placement?: string;
}

/** <synergos-scroll-top> · pieza · diccionario: ScrollTop */
export interface ScrollTopProps {
  /** decision */
  readonly scrollThreshold?: number;
  /** decision */
  readonly position?: string;
  /** contenido */
  readonly label?: string;
}

/** <synergos-search-box> · pieza */
export interface SearchBoxProps {
  /** contenido */
  readonly placeholder?: string;
  /** decision */
  readonly submitToPage?: boolean;
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

/** <synergos-seller> · funcionalidad */
export interface SellerProps {
  /** contenido */
  readonly heading?: string;
  /** contenido */
  readonly subheading?: string;
  /** negocio */
  readonly apiBase: string;
}

/** <synergos-separator> · pieza */
export interface SeparatorProps {
  /** decision */
  readonly style?: string;
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

/** <synergos-stepper> · pieza · diccionario: Stepper */
export interface StepperProps {
  /** contenido */
  readonly steps?: readonly StepperItem[];
  /** decision */
  readonly currentStep?: number;
}

/** <synergos-storefront> · funcionalidad */
export interface StorefrontProps {
  /** contenido */
  readonly heading?: string;
  /** contenido */
  readonly subheading?: string;
  /** negocio */
  readonly apiBase: string;
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

/** <synergos-timeline> · pieza · diccionario: Timeline */
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

/** <synergos-travel-shell> · funcionalidad */
export interface TravelShellProps {
  /** contenido */
  readonly heading?: string;
  /** contenido */
  readonly subheading?: string;
  /** negocio */
  readonly apiBase: string;
}

/** <synergos-tree-view> · pieza · diccionario: TreeView */
export interface TreeViewProps {
  /** contenido */
  readonly tree?: readonly TreeViewNode[];
  /** decision */
  readonly expandAll?: boolean;
  /** contenido */
  readonly label?: string;
}

/** <synergos-video-player> · pieza · diccionario: Media, Video */
export interface VideoPlayerProps {
  /** contenido */
  readonly videoFile?: string;
  /** contenido */
  readonly posterImage?: string;
}

export const ACADEMY_SYNHOST: ElementoSynHost<AcademyProps> = {
  nombre: "academy",
  tipo: "funcionalidad",
  record: "AcademyProps",
  diccionario: [],
  claves: [],
  campos: ["heading","subheading","apiBase"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "heading": "Aprende lo que el mercado pide",
    "subheading": "Catálogo, lecciones e instructores a tu ritmo",
    "apiBase": "/api/academy"
  },
};

export const ACCORDION_SYNHOST: ElementoSynHost<AccordionProps> = {
  nombre: "accordion",
  tipo: "pieza",
  record: "AccordionProps",
  diccionario: [],
  claves: [],
  campos: ["items","allowMultiple"],
  listas: {"items":["title","body"]},
  selectores: [],
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
  selectores: [],
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
  diccionario: ["Media","Audio"],
  claves: ["Audio.Aria","Audio.Empty","Media.Mute","Media.Pause","Media.Play","Media.Seek","Media.Time","Media.Unmute","Media.Volume"],
  campos: ["audioFile","trackTitle","artistName"],
  listas: {},
  selectores: [],
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
  selectores: [],
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
  selectores: [],
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
  diccionario: ["BadgeGroup"],
  claves: ["BadgeGroup.Aria","BadgeGroup.Empty"],
  campos: ["badges","layout"],
  listas: {"badges":["label","tone"]},
  selectores: [
    {
      "propiedad": "layout",
      "dataType": "DTSelectDisplayLayout",
      "multiple": false,
      "campo": "layout",
      "valores": [
        {
          "editor": "inline",
          "viaja": "inline"
        },
        {
          "editor": "stack",
          "viaja": "stack"
        },
        {
          "editor": "grid",
          "viaja": "grid"
        },
        {
          "editor": "cluster",
          "viaja": "wrap"
        }
      ]
    }
  ],
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

export const BLOGS_SYNHOST: ElementoSynHost<BlogsProps> = {
  nombre: "blogs",
  tipo: "funcionalidad",
  record: "BlogsProps",
  diccionario: [],
  claves: [],
  campos: ["heading","subheading","apiBase"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "heading": "Conecta, publica y crece tu audiencia",
    "subheading": "Sigue autores, publica historias y reacciona en tiempo real",
    "apiBase": "/api/blogs"
  },
};

export const BOOKING_WIZARD_SYNHOST: ElementoSynHost<BookingWizardProps> = {
  nombre: "booking-wizard",
  tipo: "funcionalidad",
  record: "BookingWizardProps",
  diccionario: [],
  claves: [],
  campos: ["destinationLabel","apiBase"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "destinationLabel": "Hoteles SynergosLabs",
    "apiBase": "/api/booking"
  },
};

export const BREADCRUMB_SYNHOST: ElementoSynHost<BreadcrumbProps> = {
  nombre: "breadcrumb",
  tipo: "pieza",
  record: "BreadcrumbProps",
  diccionario: ["Nav.Breadcrumb"],
  claves: ["Nav.Breadcrumb"],
  campos: ["items"],
  listas: {"items":["label","href"]},
  selectores: [],
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
  listas: {"slides":["src","alt","label","linkUrl"]},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "slides": [
      {
        "src": "/media/sala.jpg",
        "alt": "Sala con ventanal",
        "label": "La sala",
        "linkUrl": "/propiedades/101"
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
  selectores: [
    {
      "propiedad": "orientation",
      "dataType": "DTSelectOrientation",
      "multiple": false,
      "campo": "orientation",
      "valores": [
        {
          "editor": "horizontal",
          "viaja": "horizontal"
        },
        {
          "editor": "vertical",
          "viaja": "vertical"
        }
      ]
    }
  ],
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
  diccionario: ["ColorPicker"],
  claves: ["ColorPicker.Hex","ColorPicker.Invalid","ColorPicker.Label"],
  campos: ["label","initialColor","palette"],
  listas: {},
  selectores: [],
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
  diccionario: ["ColorSwatches"],
  claves: ["ColorSwatches.Aria","ColorSwatches.Empty","ColorSwatches.None","ColorSwatches.Selected"],
  campos: ["swatches","shape"],
  listas: {"swatches":["color","label"]},
  selectores: [
    {
      "propiedad": "shape",
      "dataType": "DTSelectSwatchShape",
      "multiple": false,
      "campo": "shape",
      "valores": [
        {
          "editor": "swatch",
          "viaja": "square"
        },
        {
          "editor": "chip",
          "viaja": "pill"
        },
        {
          "editor": "dot",
          "viaja": "circle"
        },
        {
          "editor": "circle",
          "viaja": "circle"
        }
      ]
    }
  ],
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
  diccionario: ["Cookie"],
  claves: ["Cookie.AcceptAll","Cookie.AlwaysOn","Cookie.Analytics.Description","Cookie.Analytics.Label","Cookie.BannerMessage","Cookie.Customize","Cookie.Marketing.Description","Cookie.Marketing.Label","Cookie.MoreInfo","Cookie.Necessary.Description","Cookie.Necessary.Label","Cookie.Options","Cookie.RejectAll","Cookie.SavePreferences","Cookie.Title"],
  campos: ["bannerText","acceptLabel","rejectLabel","settingsLabel","policyLink","policyLabel"],
  listas: {},
  selectores: [],
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
  diccionario: ["Countdown"],
  claves: ["Countdown.Days","Countdown.Hours","Countdown.Milestone.Day","Countdown.Milestone.Hour","Countdown.Milestone.Minute","Countdown.Milestone.TenMinutes","Countdown.Minutes","Countdown.Seconds","Countdown.Short.Minutes","Countdown.Short.Seconds","Countdown.Started","Countdown.Unavailable"],
  campos: ["targetDate"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "targetDate": "2030-12-31T23:59:59-05:00"
  },
};

export const COUNTDOWN_DIGITAL_SYNHOST: ElementoSynHost<CountdownDigitalProps> = {
  nombre: "countdown-digital",
  tipo: "pieza",
  record: "CountdownDigitalProps",
  diccionario: ["Countdown"],
  claves: ["Countdown.Days","Countdown.Hours","Countdown.Milestone.Day","Countdown.Milestone.Hour","Countdown.Milestone.Minute","Countdown.Milestone.TenMinutes","Countdown.Minutes","Countdown.Seconds","Countdown.Short.Minutes","Countdown.Short.Seconds","Countdown.Started","Countdown.Unavailable"],
  campos: ["targetDate","showLabels","style"],
  listas: {},
  selectores: [
    {
      "propiedad": "style",
      "dataType": "DTSelectCountdownStyle",
      "multiple": false,
      "campo": "style",
      "valores": [
        {
          "editor": "digits",
          "viaja": "plain"
        },
        {
          "editor": "flip",
          "viaja": "flip"
        }
      ]
    }
  ],
  ejemplo: {
    "culture": "es-CO",
    "targetDate": "2030-12-31T23:59:59-05:00",
    "showLabels": false,
    "style": "plain"
  },
};

export const DATA_GRID_SYNHOST: ElementoSynHost<DataGridProps> = {
  nombre: "data-grid",
  tipo: "pieza",
  record: "DataGridProps",
  diccionario: ["DataGrid"],
  claves: ["DataGrid.Aria","DataGrid.Count.One","DataGrid.Count.Other","DataGrid.Cta","DataGrid.Date","DataGrid.Detail","DataGrid.Duration","DataGrid.Empty","DataGrid.Free","DataGrid.Level","DataGrid.Loading","DataGrid.Location","DataGrid.NoResults","DataGrid.Place","DataGrid.Price","DataGrid.PriceFrom"],
  campos: ["rows"],
  listas: {"rows":["id","title","href","image","imageAlt","badge","specs"]},
  selectores: [
    {
      "propiedad": "fuente",
      "dataType": "DTSelectFuenteDeListado",
      "multiple": false,
      "campo": null,
      "valores": [
        {
          "editor": "fichas",
          "viaja": null
        },
        {
          "editor": "cursos",
          "viaja": null
        },
        {
          "editor": "eventos",
          "viaja": null
        },
        {
          "editor": "inmuebles",
          "viaja": null
        }
      ],
      "deDatos": true
    }
  ],
  ejemplo: {
    "culture": "es-CO",
    "rows": [
      {
        "id": "ficha-1",
        "title": "Asesoría express",
        "href": "/booking/servicios/asesoria-express/",
        "image": "/media/asesoria.jpg",
        "imageAlt": "Asesoría express",
        "badge": "Consultoría",
        "specs": [
          {
            "label": "Precio",
            "value": "$ 180.000"
          }
        ]
      }
    ]
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
  selectores: [],
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

export const EHR_SYNHOST: ElementoSynHost<EhrProps> = {
  nombre: "ehr",
  tipo: "funcionalidad",
  record: "EhrProps",
  diccionario: [],
  claves: [],
  campos: ["apiBase"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "apiBase": "/api/ehr"
  },
};

export const EVENTOS_SYNHOST: ElementoSynHost<EventosProps> = {
  nombre: "eventos",
  tipo: "funcionalidad",
  record: "EventosProps",
  diccionario: [],
  claves: [],
  campos: ["heading","subheading","role","apiBase","feePercent","platformFeePercent"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "heading": "Vive los mejores eventos",
    "subheading": "Conciertos, teatro y festivales",
    "role": "organizer",
    "apiBase": "/api/eventos",
    "feePercent": 12,
    "platformFeePercent": 10
  },
};

export const FAB_SYNHOST: ElementoSynHost<FabProps> = {
  nombre: "fab",
  tipo: "pieza",
  record: "FabProps",
  diccionario: ["Fab"],
  claves: ["Fab.Aria"],
  campos: ["iconKey","actionLink","target","position","label"],
  listas: {},
  selectores: [
    {
      "propiedad": "iconKey",
      "dataType": "DTSelectIcono",
      "multiple": false,
      "campo": "iconKey",
      "valores": [
        {
          "editor": "alert-circle",
          "viaja": "alert-circle"
        },
        {
          "editor": "alert-triangle",
          "viaja": "alert-triangle"
        },
        {
          "editor": "arrow-down",
          "viaja": "arrow-down"
        },
        {
          "editor": "arrow-left",
          "viaja": "arrow-left"
        },
        {
          "editor": "arrow-right",
          "viaja": "arrow-right"
        },
        {
          "editor": "arrow-up",
          "viaja": "arrow-up"
        },
        {
          "editor": "award",
          "viaja": "award"
        },
        {
          "editor": "bell",
          "viaja": "bell"
        },
        {
          "editor": "calendar",
          "viaja": "calendar"
        },
        {
          "editor": "check",
          "viaja": "check"
        },
        {
          "editor": "check-circle",
          "viaja": "check-circle"
        },
        {
          "editor": "chevron-down",
          "viaja": "chevron-down"
        },
        {
          "editor": "chevron-left",
          "viaja": "chevron-left"
        },
        {
          "editor": "chevron-right",
          "viaja": "chevron-right"
        },
        {
          "editor": "chevron-up",
          "viaja": "chevron-up"
        },
        {
          "editor": "clock",
          "viaja": "clock"
        },
        {
          "editor": "credit-card",
          "viaja": "credit-card"
        },
        {
          "editor": "download",
          "viaja": "download"
        },
        {
          "editor": "edit",
          "viaja": "edit"
        },
        {
          "editor": "external-link",
          "viaja": "external-link"
        },
        {
          "editor": "eye",
          "viaja": "eye"
        },
        {
          "editor": "file-text",
          "viaja": "file-text"
        },
        {
          "editor": "gift",
          "viaja": "gift"
        },
        {
          "editor": "globe",
          "viaja": "globe"
        },
        {
          "editor": "heart",
          "viaja": "heart"
        },
        {
          "editor": "help-circle",
          "viaja": "help-circle"
        },
        {
          "editor": "home",
          "viaja": "home"
        },
        {
          "editor": "image",
          "viaja": "image"
        },
        {
          "editor": "info",
          "viaja": "info"
        },
        {
          "editor": "lock",
          "viaja": "lock"
        },
        {
          "editor": "mail",
          "viaja": "mail"
        },
        {
          "editor": "map-pin",
          "viaja": "map-pin"
        },
        {
          "editor": "menu",
          "viaja": "menu"
        },
        {
          "editor": "message",
          "viaja": "message"
        },
        {
          "editor": "minus",
          "viaja": "minus"
        },
        {
          "editor": "phone",
          "viaja": "phone"
        },
        {
          "editor": "play",
          "viaja": "play"
        },
        {
          "editor": "plus",
          "viaja": "plus"
        },
        {
          "editor": "search",
          "viaja": "search"
        },
        {
          "editor": "settings",
          "viaja": "settings"
        },
        {
          "editor": "shield-check",
          "viaja": "shield-check"
        },
        {
          "editor": "shopping-cart",
          "viaja": "shopping-cart"
        },
        {
          "editor": "star",
          "viaja": "star"
        },
        {
          "editor": "tag",
          "viaja": "tag"
        },
        {
          "editor": "trash",
          "viaja": "trash"
        },
        {
          "editor": "truck",
          "viaja": "truck"
        },
        {
          "editor": "upload",
          "viaja": "upload"
        },
        {
          "editor": "user",
          "viaja": "user"
        },
        {
          "editor": "users",
          "viaja": "users"
        },
        {
          "editor": "x",
          "viaja": "x"
        },
        {
          "editor": "x-circle",
          "viaja": "x-circle"
        },
        {
          "editor": "zap",
          "viaja": "zap"
        }
      ]
    },
    {
      "propiedad": "position",
      "dataType": "DTSelectScreenPosition",
      "multiple": false,
      "campo": "position",
      "valores": [
        {
          "editor": "top-left",
          "viaja": "top-left"
        },
        {
          "editor": "top-center",
          "viaja": "top-center"
        },
        {
          "editor": "top-right",
          "viaja": "top-right"
        },
        {
          "editor": "bottom-left",
          "viaja": "bottom-left"
        },
        {
          "editor": "bottom-center",
          "viaja": "bottom-center"
        },
        {
          "editor": "bottom-right",
          "viaja": "bottom-right"
        }
      ]
    }
  ],
  ejemplo: {
    "culture": "es-CO",
    "iconKey": "message",
    "actionLink": "https://wa.me/573001234567",
    "target": "_blank",
    "position": "bottom-left",
    "label": "Escribinos por WhatsApp"
  },
};

export const FORM_STEPPER_SYNHOST: ElementoSynHost<FormStepperProps> = {
  nombre: "form-stepper",
  tipo: "funcionalidad",
  record: "FormStepperProps",
  diccionario: ["Form.Messages","Form.Actions","Form.Validation.Required","Form.Placeholders.SelectOption","Form.Submit"],
  claves: ["Form.Actions.Apply","Form.Actions.Back","Form.Actions.Next","Form.Actions.Register","Form.Actions.RequestDemo","Form.Actions.Send","Form.Actions.Subscribe","Form.Messages.Error","Form.Messages.NetworkError","Form.Messages.NotFound","Form.Messages.Sending","Form.Messages.Success","Form.Placeholders.SelectOption","Form.Submit","Form.Validation.Required"],
  campos: ["formKey","steps","allowSkip","apiBase","honeypotField"],
  listas: {"steps":["title","fields","description"]},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "formKey": "reserva-cita",
    "steps": [
      {
        "title": "Tu reserva",
        "fields": [
          {
            "name": "servicio",
            "label": "Servicio",
            "type": "select",
            "required": true,
            "placeholder": "Elige uno",
            "helpText": "Puedes cambiarlo después.",
            "options": [
              "Asesoría express",
              "Auditorio"
            ]
          }
        ],
        "description": "Elige el servicio y la fecha."
      }
    ],
    "allowSkip": true,
    "apiBase": "/api/forms",
    "honeypotField": "syn_hp"
  },
};

export const GOV_SYNHOST: ElementoSynHost<GovProps> = {
  nombre: "gov",
  tipo: "funcionalidad",
  record: "GovProps",
  diccionario: [],
  claves: [],
  campos: ["heading","subheading","apiBase"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "heading": "Tus trámites, sin filas",
    "subheading": "Radica, paga la tasa y sigue tu expediente",
    "apiBase": "/api/gov"
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
  selectores: [],
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
  selectores: [
    {
      "propiedad": "iconKey",
      "dataType": "DTSelectIcono",
      "multiple": false,
      "campo": "iconName",
      "valores": [
        {
          "editor": "alert-circle",
          "viaja": "alert-circle"
        },
        {
          "editor": "alert-triangle",
          "viaja": "alert-triangle"
        },
        {
          "editor": "arrow-down",
          "viaja": "arrow-down"
        },
        {
          "editor": "arrow-left",
          "viaja": "arrow-left"
        },
        {
          "editor": "arrow-right",
          "viaja": "arrow-right"
        },
        {
          "editor": "arrow-up",
          "viaja": "arrow-up"
        },
        {
          "editor": "award",
          "viaja": "award"
        },
        {
          "editor": "bell",
          "viaja": "bell"
        },
        {
          "editor": "calendar",
          "viaja": "calendar"
        },
        {
          "editor": "check",
          "viaja": "check"
        },
        {
          "editor": "check-circle",
          "viaja": "check-circle"
        },
        {
          "editor": "chevron-down",
          "viaja": "chevron-down"
        },
        {
          "editor": "chevron-left",
          "viaja": "chevron-left"
        },
        {
          "editor": "chevron-right",
          "viaja": "chevron-right"
        },
        {
          "editor": "chevron-up",
          "viaja": "chevron-up"
        },
        {
          "editor": "clock",
          "viaja": "clock"
        },
        {
          "editor": "credit-card",
          "viaja": "credit-card"
        },
        {
          "editor": "download",
          "viaja": "download"
        },
        {
          "editor": "edit",
          "viaja": "edit"
        },
        {
          "editor": "external-link",
          "viaja": "external-link"
        },
        {
          "editor": "eye",
          "viaja": "eye"
        },
        {
          "editor": "file-text",
          "viaja": "file-text"
        },
        {
          "editor": "gift",
          "viaja": "gift"
        },
        {
          "editor": "globe",
          "viaja": "globe"
        },
        {
          "editor": "heart",
          "viaja": "heart"
        },
        {
          "editor": "help-circle",
          "viaja": "help-circle"
        },
        {
          "editor": "home",
          "viaja": "home"
        },
        {
          "editor": "image",
          "viaja": "image"
        },
        {
          "editor": "info",
          "viaja": "info"
        },
        {
          "editor": "lock",
          "viaja": "lock"
        },
        {
          "editor": "mail",
          "viaja": "mail"
        },
        {
          "editor": "map-pin",
          "viaja": "map-pin"
        },
        {
          "editor": "menu",
          "viaja": "menu"
        },
        {
          "editor": "message",
          "viaja": "message"
        },
        {
          "editor": "minus",
          "viaja": "minus"
        },
        {
          "editor": "phone",
          "viaja": "phone"
        },
        {
          "editor": "play",
          "viaja": "play"
        },
        {
          "editor": "plus",
          "viaja": "plus"
        },
        {
          "editor": "search",
          "viaja": "search"
        },
        {
          "editor": "settings",
          "viaja": "settings"
        },
        {
          "editor": "shield-check",
          "viaja": "shield-check"
        },
        {
          "editor": "shopping-cart",
          "viaja": "shopping-cart"
        },
        {
          "editor": "star",
          "viaja": "star"
        },
        {
          "editor": "tag",
          "viaja": "tag"
        },
        {
          "editor": "trash",
          "viaja": "trash"
        },
        {
          "editor": "truck",
          "viaja": "truck"
        },
        {
          "editor": "upload",
          "viaja": "upload"
        },
        {
          "editor": "user",
          "viaja": "user"
        },
        {
          "editor": "users",
          "viaja": "users"
        },
        {
          "editor": "x",
          "viaja": "x"
        },
        {
          "editor": "x-circle",
          "viaja": "x-circle"
        },
        {
          "editor": "zap",
          "viaja": "zap"
        }
      ]
    }
  ],
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
  selectores: [
    {
      "propiedad": "kpiTrend",
      "dataType": "DTSelectKpiTrend",
      "multiple": false,
      "campo": "trend",
      "valores": [
        {
          "editor": "up",
          "viaja": "up"
        },
        {
          "editor": "down",
          "viaja": "down"
        },
        {
          "editor": "flat",
          "viaja": "flat"
        }
      ]
    }
  ],
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
  selectores: [],
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
  selectores: [],
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
  diccionario: ["Notification"],
  claves: ["Notification.Aria.List","Notification.Dismiss","Notification.DismissAll","Notification.Empty","Notification.MarkAllRead","Notification.MarkRead","Notification.New"],
  campos: ["toasts","durationMs"],
  listas: {"toasts":["message","variant"]},
  selectores: [
    {
      "propiedad": "type",
      "dataType": "DTSelectToastType",
      "multiple": false,
      "campo": "toasts[].variant",
      "valores": [
        {
          "editor": "info",
          "viaja": "info"
        },
        {
          "editor": "success",
          "viaja": "success"
        },
        {
          "editor": "warning",
          "viaja": "warning"
        },
        {
          "editor": "error",
          "viaja": "error"
        },
        {
          "editor": "neutral",
          "viaja": "neutral"
        }
      ]
    }
  ],
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
  diccionario: ["ProgressBar"],
  claves: ["ProgressBar.Aria"],
  campos: ["value","max","label"],
  listas: {},
  selectores: [],
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
  diccionario: ["RangeSlider"],
  claves: ["RangeSlider.Aria","RangeSlider.Max","RangeSlider.Min"],
  campos: ["label","min","max","step","high"],
  listas: {},
  selectores: [],
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
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "value": 4,
    "max": 5,
    "label": "Valoración de los huéspedes"
  },
};

export const REALTY_SYNHOST: ElementoSynHost<RealtyProps> = {
  nombre: "realty",
  tipo: "funcionalidad",
  record: "RealtyProps",
  diccionario: [],
  claves: [],
  campos: ["heading","subheading","apiBase","defaultRatePercent"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "heading": "Encuentra el lugar que estás buscando",
    "subheading": "Compra y arriendo, en lista y en mapa",
    "apiBase": "/api/realty",
    "defaultRatePercent": 12
  },
};

export const RICH_TOOLTIP_SYNHOST: ElementoSynHost<RichTooltipProps> = {
  nombre: "rich-tooltip",
  tipo: "pieza",
  record: "RichTooltipProps",
  diccionario: ["Common.Actions"],
  claves: ["Common.Actions.Back","Common.Actions.Close","Common.Actions.Collapse","Common.Actions.ContactUs","Common.Actions.Download","Common.Actions.Expand","Common.Actions.GetDirections","Common.Actions.GetStarted","Common.Actions.LearnMore","Common.Actions.Next","Common.Actions.Open","Common.Actions.Previous","Common.Actions.ReadMore","Common.Actions.SeeMore","Common.Actions.Share","Common.Actions.ViewAll"],
  campos: ["triggerText","body","placement"],
  listas: {},
  selectores: [
    {
      "propiedad": "placement",
      "dataType": "DTSelectPlacement",
      "multiple": false,
      "campo": "placement",
      "valores": [
        {
          "editor": "top",
          "viaja": "top"
        },
        {
          "editor": "bottom",
          "viaja": "bottom"
        },
        {
          "editor": "left",
          "viaja": "left"
        },
        {
          "editor": "right",
          "viaja": "right"
        }
      ]
    }
  ],
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
  diccionario: ["ScrollTop"],
  claves: ["ScrollTop.Aria"],
  campos: ["scrollThreshold","position","label"],
  listas: {},
  selectores: [
    {
      "propiedad": "position",
      "dataType": "DTSelectScreenPosition",
      "multiple": false,
      "campo": "position",
      "valores": [
        {
          "editor": "top-left",
          "viaja": "bottom-left"
        },
        {
          "editor": "top-center",
          "viaja": "bottom-center"
        },
        {
          "editor": "top-right",
          "viaja": "bottom-right"
        },
        {
          "editor": "bottom-left",
          "viaja": "bottom-left"
        },
        {
          "editor": "bottom-center",
          "viaja": "bottom-center"
        },
        {
          "editor": "bottom-right",
          "viaja": "bottom-right"
        }
      ]
    }
  ],
  ejemplo: {
    "culture": "es-CO",
    "scrollThreshold": 400,
    "position": "bottom-left",
    "label": "Subir al inicio"
  },
};

export const SEARCH_BOX_SYNHOST: ElementoSynHost<SearchBoxProps> = {
  nombre: "search-box",
  tipo: "pieza",
  record: "SearchBoxProps",
  diccionario: [],
  claves: [],
  campos: ["placeholder","submitToPage"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "placeholder": "Buscar cursos por tema o nivel…",
    "submitToPage": true
  },
};

export const SELECT_MULTI_SYNHOST: ElementoSynHost<SelectMultiProps> = {
  nombre: "select-multi",
  tipo: "pieza",
  record: "SelectMultiProps",
  diccionario: ["SelectMulti","Common.States"],
  claves: ["Common.States.ComingSoon","Common.States.Error","Common.States.Loading","Common.States.New","Common.States.NoResults","Common.States.NotAvailable","Common.States.Optional","Common.States.Required","Common.States.Success","SelectMulti.Capacity","SelectMulti.Clear","SelectMulti.Options","SelectMulti.Placeholder","SelectMulti.Remove","SelectMulti.Search","SelectMulti.Selected.One","SelectMulti.Selected.Other","SelectMulti.Selection"],
  campos: ["label","options","maxSelections"],
  listas: {"options":["value","label","disabled"]},
  selectores: [],
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
        "label": "Zona BBQ",
        "disabled": true
      }
    ],
    "maxSelections": 2
  },
};

export const SELLER_SYNHOST: ElementoSynHost<SellerProps> = {
  nombre: "seller",
  tipo: "funcionalidad",
  record: "SellerProps",
  diccionario: [],
  claves: [],
  campos: ["heading","subheading","apiBase"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "heading": "Tu negocio, en un solo panel",
    "subheading": "Ventas, publicaciones, mensajes y devoluciones",
    "apiBase": "/api/shop"
  },
};

export const SEPARATOR_SYNHOST: ElementoSynHost<SeparatorProps> = {
  nombre: "separator",
  tipo: "pieza",
  record: "SeparatorProps",
  diccionario: [],
  claves: [],
  campos: ["style"],
  listas: {},
  selectores: [
    {
      "propiedad": "style",
      "dataType": "DTSelectSeparatorStyle",
      "multiple": false,
      "campo": "style",
      "valores": [
        {
          "editor": "solid",
          "viaja": "solid"
        },
        {
          "editor": "dashed",
          "viaja": "dashed"
        },
        {
          "editor": "dotted",
          "viaja": "dotted"
        },
        {
          "editor": "double",
          "viaja": "double"
        },
        {
          "editor": "gradient",
          "viaja": "gradient"
        }
      ]
    }
  ],
  ejemplo: {
    "culture": "es-CO",
    "style": "dashed"
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
  selectores: [
    {
      "propiedad": "platforms",
      "dataType": "DTSelectSharePlatform",
      "multiple": true,
      "campo": "platforms[]",
      "valores": [
        {
          "editor": "facebook",
          "viaja": "facebook"
        },
        {
          "editor": "twitter",
          "viaja": "x"
        },
        {
          "editor": "linkedin",
          "viaja": "linkedin"
        },
        {
          "editor": "whatsapp",
          "viaja": "whatsapp"
        },
        {
          "editor": "telegram",
          "viaja": "telegram"
        },
        {
          "editor": "email",
          "viaja": "email"
        },
        {
          "editor": "reddit",
          "viaja": "reddit"
        },
        {
          "editor": "pinterest",
          "viaja": "pinterest"
        }
      ]
    }
  ],
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
  diccionario: ["Stepper"],
  claves: ["Stepper.Aria","Stepper.Status.Active","Stepper.Status.Done","Stepper.Status.Pending","Stepper.Step","Stepper.Summary"],
  campos: ["steps","currentStep"],
  listas: {"steps":["title","description","id"]},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "steps": [
      {
        "title": "Datos",
        "description": "Tus datos de contacto",
        "id": "datos"
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

export const STOREFRONT_SYNHOST: ElementoSynHost<StorefrontProps> = {
  nombre: "storefront",
  tipo: "funcionalidad",
  record: "StorefrontProps",
  diccionario: [],
  claves: [],
  campos: ["heading","subheading","apiBase"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "heading": "Compra en nuestra tienda online",
    "subheading": "Catálogo, carrito y checkout",
    "apiBase": "/api/shop"
  },
};

export const TABS_SYNHOST: ElementoSynHost<TabsProps> = {
  nombre: "tabs",
  tipo: "pieza",
  record: "TabsProps",
  diccionario: [],
  claves: [],
  campos: ["tabs","initialTab"],
  listas: {"tabs":["label","id","content","disabled"]},
  selectores: [],
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
      },
      {
        "label": "Políticas",
        "id": "politicas",
        "content": "Próximamente.",
        "disabled": true
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
  selectores: [
    {
      "propiedad": "tagColor",
      "dataType": "DTSelectTagColor",
      "multiple": false,
      "campo": "color",
      "valores": [
        {
          "editor": "neutral",
          "viaja": "neutral"
        },
        {
          "editor": "brand",
          "viaja": "brand"
        },
        {
          "editor": "success",
          "viaja": "success"
        },
        {
          "editor": "warning",
          "viaja": "warning"
        },
        {
          "editor": "danger",
          "viaja": "danger"
        },
        {
          "editor": "info",
          "viaja": "info"
        }
      ]
    }
  ],
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
  diccionario: ["Timeline"],
  claves: ["Timeline.Aria","Timeline.Empty"],
  campos: ["events"],
  listas: {"events":["date","title","body"]},
  selectores: [],
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
  listas: {"steps":["target","title","body","placement"]},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "steps": [
      {
        "target": ".site-header",
        "title": "Bienvenido",
        "body": "Este es el menú principal.",
        "placement": "bottom"
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

export const TRAVEL_SHELL_SYNHOST: ElementoSynHost<TravelShellProps> = {
  nombre: "travel-shell",
  tipo: "funcionalidad",
  record: "TravelShellProps",
  diccionario: [],
  claves: [],
  campos: ["heading","subheading","apiBase"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "heading": "Reserva tu próximo viaje",
    "subheading": "Vuelos, hoteles y paquetes",
    "apiBase": "/api/travel"
  },
};

export const TREE_VIEW_SYNHOST: ElementoSynHost<TreeViewProps> = {
  nombre: "tree-view",
  tipo: "pieza",
  record: "TreeViewProps",
  diccionario: ["TreeView"],
  claves: ["TreeView.Aria","TreeView.Collapse","TreeView.Empty","TreeView.Expand"],
  campos: ["tree","expandAll","label"],
  listas: {"tree":["label","children","id","href","icon","expanded"]},
  selectores: [],
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
        ],
        "id": "productos",
        "icon": "tag",
        "expanded": true
      },
      {
        "label": "Servicios",
        "href": "/servicios"
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
  diccionario: ["Media","Video"],
  claves: ["Media.Mute","Media.Pause","Media.Play","Media.Seek","Media.Time","Media.Unmute","Media.Volume","Video.Aria","Video.Empty","Video.ExitFullscreen","Video.Fullscreen","Video.Player"],
  campos: ["videoFile","posterImage"],
  listas: {},
  selectores: [],
  ejemplo: {
    "culture": "es-CO",
    "videoFile": "/media/propiedades/recorrido-casa-lago.mp4",
    "posterImage": "/media/propiedades/casa-lago-fachada.jpg"
  },
};

/** Todos los elementos con contrato. Un spec exige que cada uno tenga su sanitizador ejecutado. */
export const ELEMENTOS_SYNHOST = [
  ACADEMY_SYNHOST,
  ACCORDION_SYNHOST,
  APP_LAUNCHER_SYNHOST,
  AUDIO_PLAYER_SYNHOST,
  AVATAR_SYNHOST,
  AVATAR_GROUP_SYNHOST,
  BADGE_GROUP_SYNHOST,
  BLOGS_SYNHOST,
  BOOKING_WIZARD_SYNHOST,
  BREADCRUMB_SYNHOST,
  CAROUSEL_SYNHOST,
  CHART_BAR_SYNHOST,
  COLOR_PICKER_SYNHOST,
  COLOR_SWATCHES_SYNHOST,
  COOKIE_CONSENT_SYNHOST,
  COUNTDOWN_CLOCK_SYNHOST,
  COUNTDOWN_DIGITAL_SYNHOST,
  DATA_GRID_SYNHOST,
  DROPDOWN_SYNHOST,
  EHR_SYNHOST,
  EVENTOS_SYNHOST,
  FAB_SYNHOST,
  FORM_STEPPER_SYNHOST,
  GOV_SYNHOST,
  HERO_BANNER_SYNHOST,
  ICON_LABEL_SYNHOST,
  KPI_CARD_SYNHOST,
  LIGHTBOX_GALLERY_SYNHOST,
  MAP_PIN_SYNHOST,
  NOTIFICATION_TOAST_SYNHOST,
  PROGRESS_BAR_SYNHOST,
  RANGE_SLIDER_SYNHOST,
  RATING_STARS_SYNHOST,
  REALTY_SYNHOST,
  RICH_TOOLTIP_SYNHOST,
  SCROLL_TOP_SYNHOST,
  SEARCH_BOX_SYNHOST,
  SELECT_MULTI_SYNHOST,
  SELLER_SYNHOST,
  SEPARATOR_SYNHOST,
  SHARE_BAR_SYNHOST,
  STEPPER_SYNHOST,
  STOREFRONT_SYNHOST,
  TABS_SYNHOST,
  TAG_SYNHOST,
  TIMELINE_SYNHOST,
  TOUR_GUIDE_SYNHOST,
  TRAVEL_SHELL_SYNHOST,
  TREE_VIEW_SYNHOST,
  VIDEO_PLAYER_SYNHOST,
] as const;
