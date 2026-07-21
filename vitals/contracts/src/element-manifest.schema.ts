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

/** Framework that produced the bundle */
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

  /** Framework that produced this bundle */
  framework: ElementFramework;

  /** Full semver string of this bundle (e.g. "1.2.3") */
  version: string;

  /** Design system tier */
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
