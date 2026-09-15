/**
 * Element Manifest — CDN contract between Synergos.UI factory and consumers (Umbraco, etc.)
 *
 * Every Web Component published to the CDN must have a manifest.json that satisfies
 * this schema. The manifest describes the element's public API so that CMS templates
 * and tooling can discover, configure, and validate element usage without reading source code.
 *
 * CDN location:
 *   /synergos/{element}/{framework}/v{major}/manifest.json
 *   /synergos/{element}/{framework}/latest/manifest.json
 */

/** Supported primitive input types for HTML attribute serialization */
export type InputType = 'string' | 'boolean' | 'number' | 'json';

/** Element tier within the design system hierarchy */
export type ElementTier = 'primitive' | 'composition' | 'module';

/**
 * Framework that produced the bundle.
 *
 * Es la ÚNICA declaración de esta unión: `FrameworkKind`, en
 * `component-resolution.contract.ts`, es hoy un alias de ésta. Estaban escritas
 * dos veces con los mismos cuatro valores y nada cruzaba las dos — añadir un
 * framework en una y no en la otra compilaba. Desde el issue #42 el valor viaja
 * del registry al manifiesto y de ahí al segmento de ruta del CDN, así que la
 * duplicación dejó de ser fea para ser peligrosa.
 *
 * `tools/lib/contract-schema.mjs` la LEE de este fichero: las herramientas ya
 * no llevan su propia copia.
 */
export type ElementFramework = 'angular' | 'react' | 'svelte' | 'vanilla';

/**
 * Describes a single public input property of a Web Component.
 *
 * HTML attribute convention: camelCase name → kebab-case attribute
 *   headingText → heading-text
 *   imageSrc    → image-src
 */
export interface InputDescriptor {
  /** camelCase name matching the component's input() property */
  name: string;

  /** Serialization type. 'json' means the attribute value is a JSON string. */
  type: InputType;

  /** Whether the element requires this input to function correctly */
  required: boolean;

  /**
   * Default value used when the attribute is absent.
   * Omit for required inputs or inputs with no meaningful default.
   */
  default?: string | boolean | number;

  /** Human-readable description for tooling and documentation */
  description?: string;
}

/**
 * Full manifest for a single element + framework combination.
 *
 * This is the public contract between the Web Component factory and its consumers.
 * Umbraco, preview tools, and CI validators read this file to understand what
 * a given bundle exposes.
 */
export interface ElementManifest {
  /** Custom Element tag name (e.g. "synergos-hero") */
  tag: string;

  /** CMS alias used by Umbraco content types (e.g. "elementCompHero") */
  alias: string;

  /**
   * Framework that produced this bundle.
   *
   * Sale de `ElementRegistryEntry.framework` (issue #42), no de en qué bucle se
   * construyó. Antes lo elegía quien llamaba a `buildManifest`, y el registry
   * —que es lo que lee el CMS— no lo declaraba en absoluto: los 132 elementos
   * eran Angular implícito mientras la ruta del CDN lo escribía explícito.
   */
  framework: ElementFramework;

  /** Full semver string of this bundle (e.g. "1.2.3") */
  version: string;

  /**
   * Design system tier.
   *
   * OJO: `ElementRegistryTier` (elements.contract.ts) admite además
   * `experience`, y esta unión no. Hoy ninguna entrada lo usa, así que la
   * diferencia está latente; no se tapa añadiéndolo acá porque el presupuesto
   * de tamaño tampoco tiene techo para ese tier y lo publicaría sin vigilancia.
   * El día que alguien declare una `experience`, la validación del manifiesto
   * se pone roja y lo nombra — que es lo que se quiere.
   */
  tier: ElementTier;

  /** Entry point filename — always "main.js" for CDN bundles */
  entryScript: 'main.js';

  /**
   * Declared public inputs. Maps 1:1 to the component's input() properties.
   * An empty array means the element accepts no inputs (or they haven't been declared yet).
   */
  inputs: InputDescriptor[];
}

/**
 * CDN Registry — top-level index file at /synergos/registry.json
 *
 * Lists all elements with their available frameworks and version history.
 * Consumers can fetch this once and cache it to discover available bundles.
 */
export interface CdnRegistry {
  /** ISO 8601 timestamp of when this registry was generated */
  generated: string;

  /** Semver of the latest release that produced this registry */
  version: string;

  /** Base URL path prefix for all element bundles */
  baseUrl: string;

  /** All published elements */
  elements: CdnRegistryEntry[];
}

/** A single element's entry in the CDN registry */
export interface CdnRegistryEntry {
  name: string;
  alias: string;
  tag: string;
  tier: ElementTier;

  /**
   * Available framework implementations.
   * Key is the framework name, value is the version info.
   */
  implementations: Record<ElementFramework, CdnVersionInfo>;
}

/** Version slots published for a given element + framework */
export interface CdnVersionInfo {
  /** Latest semver published (e.g. "1.2.3") */
  latest: string;

  /**
   * Map of major-pinned aliases to the last patch in that major.
   * e.g. { "v1": "1.2.3", "v0": "0.9.1" }
   */
  [majorAlias: string]: string;
}
