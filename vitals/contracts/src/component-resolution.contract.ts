/**
 * Typed domain contracts for selector -> component resolution.
 *
 * This contract is intentionally framework-agnostic and stable so it can be
 * shared by runtime resolvers, registry readers and CMS adapters.
 */

export type FrameworkKind = 'angular' | 'react' | 'svelte' | 'vanilla';

export type ComponentTier = 'primitive' | 'composition' | 'module' | 'experience';

export type ComponentSelector = `${'element' | 'experience'}${string}` | string;
export type ComponentTag = `synergos-${string}`;

export type RegistrySource = 'static-json' | 'runtime-bootstrap' | 'remote-manifest' | 'cms-adapter';

export type ComponentInputType = 'string' | 'number' | 'boolean' | 'json';

export interface ComponentInputContract {
  readonly name: string;
  readonly type: ComponentInputType;
  readonly required: boolean;
  readonly default?: unknown;
  readonly description?: string;
}

export interface ArtifactDescriptor {
  readonly framework: FrameworkKind;
  readonly version: string;
  readonly entryScript: string;
  readonly cdnPath?: string;
  readonly integrity?: string;
}

export interface ManifestDescriptor {
  readonly schemaVersion: 'v1';
  readonly alias: ComponentSelector;
  readonly tag: ComponentTag;
  readonly framework: FrameworkKind;
  readonly tier: ComponentTier;
  readonly version: string;
  readonly entryScript: string;
  readonly inputs: readonly ComponentInputContract[];
}

export interface VersionedComponentContract {
  readonly contractVersion: string;
  readonly manifest: ManifestDescriptor;
}

export interface ComponentRegistryEntry {
  readonly selector: ComponentSelector;
  readonly alias: ComponentSelector;
  readonly tag: ComponentTag;
  readonly framework: FrameworkKind;
  readonly tier: ComponentTier;
  readonly source: RegistrySource;
  readonly artifact?: ArtifactDescriptor;
  readonly manifest?: ManifestDescriptor;
}

export interface RuntimeComponentDefinition {
  readonly selector: ComponentSelector;
  readonly alias: ComponentSelector;
  readonly name?: string;
  readonly tag: ComponentTag;
  readonly framework: FrameworkKind;
  readonly source: RegistrySource;
  readonly tier?: ComponentTier;
  readonly artifact?: ArtifactDescriptor;
  readonly manifest?: ManifestDescriptor;
}

export type ResolutionErrorCode =
  | 'invalid_selector'
  | 'selector_not_found'
  | 'framework_not_supported'
  | 'artifact_not_found'
  | 'manifest_invalid'
  | 'component_not_registered';

export interface ResolutionError {
  readonly code: ResolutionErrorCode;
  readonly selector: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface ComponentResolutionSuccess {
  readonly ok: true;
  readonly selector: string;
  readonly definition: RuntimeComponentDefinition;
}

export interface ComponentResolutionFailure {
  readonly ok: false;
  readonly selector: string;
  readonly error: ResolutionError;
}

export type ComponentResolutionResult = ComponentResolutionSuccess | ComponentResolutionFailure;

export function isFrameworkKind(value: unknown): value is FrameworkKind {
  return (
    value === 'angular' ||
    value === 'react' ||
    value === 'svelte' ||
    value === 'vanilla'
  );
}

export function normalizeComponentSelector(selector: string): string {
  return selector.trim();
}
