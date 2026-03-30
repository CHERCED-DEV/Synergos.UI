/**
 * Framework-agnostic lifecycle hook definitions.
 * Each framework adapter maps these to its native lifecycle.
 */
export interface LifecycleHooks {
  /** Called when the element is mounted to the DOM */
  onMount?(): void;

  /** Called when inputs change */
  onInputChange?(changes: Record<string, { previous: unknown; current: unknown }>): void;

  /** Called when the element is removed from the DOM */
  onDestroy?(): void;
}
