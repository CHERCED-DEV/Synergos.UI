/**
 * Interface that every framework must implement to register a Web Component.
 * Defines the contract between the CMS orchestrator and any UI framework.
 */
export interface ElementProtocol {
  /** The custom element tag name (e.g., 'synergos-hero') */
  readonly tag: string;

  /** Mount the component into the given host element */
  mount(host: HTMLElement, inputs: Record<string, unknown>): void;

  /** Update component inputs */
  update(inputs: Record<string, unknown>): void;

  /** Unmount and clean up the component */
  destroy(): void;
}

/**
 * Registry entry for a framework-specific element implementation.
 */
export interface ElementRegistration {
  tag: string;
  framework: 'angular' | 'react' | 'svelte' | 'vanilla';
  factory: () => ElementProtocol;
}
