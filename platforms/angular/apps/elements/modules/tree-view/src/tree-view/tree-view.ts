import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynTreeView</c>.
 *
 * A hierarchical, accessible tree: nodes expand/collapse, a single node is
 * selectable, and the whole tree is operable from the keyboard following the
 * WAI-ARIA `tree` pattern (roving tabindex). Built for navigation trees,
 * category browsers and file/folder explorers across verticals.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 *
 * The shared `@synergos/contracts` package does not (yet) declare a
 * `TreeViewElementConfig`; the canonical shape lives here next to the
 * component until that contract lands in the registry ola.
 */
export interface TreeViewRuntimeConfig {
  readonly label?: string;
  readonly emptyLabel?: string;
  readonly expandAll?: boolean;
  readonly tree?: readonly TreeNodeConfig[];
}

export interface TreeNodeConfig {
  readonly id?: string;
  readonly label?: string;
  readonly href?: string;
  readonly icon?: string;
  readonly expanded?: boolean;
  readonly children?: readonly TreeNodeConfig[];
}

/** Emitted on the `nodeselect` CustomEvent and the typed Angular output. */
export interface TreeNodeSelectDetail {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

/** A flattened, render-ready tree node (depth-first with level metadata). */
export interface TreeFlatNode {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: string;
  readonly level: number;
  readonly hasChildren: boolean;
  /** Position within siblings (1-based) for `aria-posinset`. */
  readonly posInSet: number;
  /** Sibling count for `aria-setsize`. */
  readonly setSize: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

interface NormalizedNode {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: string;
  readonly initiallyExpanded: boolean;
  readonly children: readonly NormalizedNode[];
}

/**
 * Normalize arbitrary input into a clean node tree. Nodes without a label are
 * dropped; ids are assigned deterministically by path when missing so they stay
 * stable across renders (needed for the expansion/selection signals).
 */
export function normalizeTree(value: unknown, path = 'n'): readonly NormalizedNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): NormalizedNode | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const label = readString(entry['label']).trim() || readString(entry['title']).trim();
      if (!label) {
        return null;
      }

      const nodePath = `${path}-${index}`;
      const id = readString(entry['id']).trim() || readString(entry['key']).trim() || nodePath;
      const children = normalizeTree(entry['children'], nodePath);

      return {
        id,
        label,
        href: readString(entry['href']).trim() || readString(entry['url']).trim(),
        icon: readString(entry['icon']).trim(),
        initiallyExpanded: readBoolean(entry['expanded']),
        children,
      };
    })
    .filter((node): node is NormalizedNode => node !== null);
}

function sanitizeTreeViewConfig(value: Partial<TreeViewRuntimeConfig>): TreeViewRuntimeConfig {
  return omitUndefinedProperties<TreeViewRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    expandAll: coerceOptionalBooleanInput(value.expandAll),
    tree: value.tree,
  });
}

@Component({
  selector: 'sg-tree-view',
  standalone: true,
  templateUrl: './tree-view.html',
  styleUrl: './tree-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tree-view' },
})
export class TreeViewElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<TreeViewRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TreeViewRuntimeConfig>(sanitizeTreeViewConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly expandAllInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'expandAll',
    transform: coerceOptionalBooleanInput,
  });
  readonly treeInput = input<string | undefined>(undefined, { alias: 'treeJson' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `nodeselect` CustomEvent. */
  readonly nodeselect = output<TreeNodeSelectDetail>();

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, 'Árbol de navegación'),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(this.emptyLabelInput(), this.config()?.emptyLabel, 'No hay elementos para mostrar.'),
  );
  readonly expandAll = computed(() =>
    resolveConfigValue(this.expandAllInput(), this.config()?.expandAll, false),
  );

  readonly nodes = computed<readonly NormalizedNode[]>(() =>
    normalizeTree(this.resolveSource(this.treeInput(), this.config()?.tree)),
  );

  readonly hasNodes = computed(() => this.nodes().length > 0);

  /** All branch (parent) node ids, for whole-tree expand operations. */
  readonly #branchIds = computed<readonly string[]>(() => {
    const ids: string[] = [];
    const walk = (list: readonly NormalizedNode[]): void => {
      for (const node of list) {
        if (node.children.length > 0) {
          ids.push(node.id);
          walk(node.children);
        }
      }
    };
    walk(this.nodes());
    return ids;
  });

  /**
   * Expanded ids the visitor has explicitly toggled. `null` means "not yet
   * touched" → fall back to the declarative defaults (`expandAll` / node flags).
   */
  readonly #userExpanded = signal<ReadonlySet<string> | null>(null);

  /** Effective expanded set: explicit user toggles, else declarative defaults. */
  readonly #expandedIds = computed<ReadonlySet<string>>(() => {
    const user = this.#userExpanded();
    if (user) {
      return user;
    }

    if (this.expandAll()) {
      return new Set(this.#branchIds());
    }

    const defaults = new Set<string>();
    const walk = (list: readonly NormalizedNode[]): void => {
      for (const node of list) {
        if (node.children.length > 0 && node.initiallyExpanded) {
          defaults.add(node.id);
        }
        walk(node.children);
      }
    };
    walk(this.nodes());
    return defaults;
  });

  /** Currently selected node id (null until the visitor picks one). */
  readonly selectedId = signal<string | null>(null);

  /** Node id that holds keyboard focus (roving tabindex). */
  readonly #focusedId = signal<string | null>(null);

  /** Visible nodes flattened depth-first, honoring collapsed branches. */
  readonly visibleNodes = computed<readonly TreeFlatNode[]>(() => {
    const expanded = this.#expandedIds();
    const flat: TreeFlatNode[] = [];

    const walk = (list: readonly NormalizedNode[], level: number): void => {
      const setSize = list.length;
      list.forEach((node, index) => {
        const hasChildren = node.children.length > 0;
        flat.push({
          id: node.id,
          label: node.label,
          href: node.href,
          icon: node.icon,
          level,
          hasChildren,
          posInSet: index + 1,
          setSize,
        });
        if (hasChildren && expanded.has(node.id)) {
          walk(node.children, level + 1);
        }
      });
    };

    walk(this.nodes(), 1);
    return flat;
  });

  /** Node id that should carry tabindex=0 (roving). */
  readonly focusedId = computed<string>(() => {
    const visible = this.visibleNodes();
    const focused = this.#focusedId();
    if (focused && visible.some((node) => node.id === focused)) {
      return focused;
    }

    const selected = this.selectedId();
    if (selected && visible.some((node) => node.id === selected)) {
      return selected;
    }

    return visible[0]?.id ?? '';
  });

  isExpanded(node: TreeFlatNode): boolean {
    return node.hasChildren && this.#expandedIds().has(node.id);
  }

  isSelected(node: TreeFlatNode): boolean {
    return this.selectedId() === node.id;
  }

  /** Expand/collapse a branch; leaf nodes are inert here. */
  toggle(node: TreeFlatNode): void {
    if (!node.hasChildren) {
      return;
    }

    const next = new Set(this.#expandedIds());
    if (next.has(node.id)) {
      next.delete(node.id);
    } else {
      next.add(node.id);
    }
    this.#userExpanded.set(next);
    this.#focusedId.set(node.id);
  }

  expand(node: TreeFlatNode): void {
    if (!node.hasChildren || this.#expandedIds().has(node.id)) {
      return;
    }
    const next = new Set(this.#expandedIds());
    next.add(node.id);
    this.#userExpanded.set(next);
  }

  collapse(node: TreeFlatNode): void {
    if (!this.#expandedIds().has(node.id)) {
      return;
    }
    const next = new Set(this.#expandedIds());
    next.delete(node.id);
    this.#userExpanded.set(next);
  }

  /** Select a node (and toggle a branch when activated directly). */
  select(node: TreeFlatNode): void {
    this.selectedId.set(node.id);
    this.#focusedId.set(node.id);

    if (node.hasChildren) {
      this.toggle(node);
    }

    const detail: TreeNodeSelectDetail = { id: node.id, label: node.label, href: node.href };
    this.nodeselect.emit(detail);
  }

  /** Roving keyboard navigation following the WAI-ARIA tree pattern. */
  onNodeKeydown(event: KeyboardEvent, node: TreeFlatNode): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveFocus(node, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveFocus(node, -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.onArrowRight(node);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.onArrowLeft(node);
        break;
      case 'Home':
        event.preventDefault();
        this.moveFocusToEdge('start');
        break;
      case 'End':
        event.preventDefault();
        this.moveFocusToEdge('end');
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.select(node);
        break;
      default:
        break;
    }
  }

  private onArrowRight(node: TreeFlatNode): void {
    if (!node.hasChildren) {
      return;
    }
    if (this.#expandedIds().has(node.id)) {
      // Already open → move into the first child.
      this.moveFocus(node, 1);
    } else {
      this.expand(node);
      this.#focusedId.set(node.id);
    }
  }

  private onArrowLeft(node: TreeFlatNode): void {
    if (node.hasChildren && this.#expandedIds().has(node.id)) {
      this.collapse(node);
      this.#focusedId.set(node.id);
      return;
    }

    // Otherwise jump to the parent (closest preceding node at a shallower level).
    const visible = this.visibleNodes();
    const index = visible.findIndex((entry) => entry.id === node.id);
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      if (visible[cursor].level < node.level) {
        this.#focusedId.set(visible[cursor].id);
        this.focusNode(visible[cursor].id);
        return;
      }
    }
  }

  private moveFocus(node: TreeFlatNode, delta: number): void {
    const visible = this.visibleNodes();
    const index = visible.findIndex((entry) => entry.id === node.id);
    if (index === -1) {
      return;
    }
    const target = visible[index + delta];
    if (!target) {
      return;
    }
    this.#focusedId.set(target.id);
    this.focusNode(target.id);
  }

  private moveFocusToEdge(edge: 'start' | 'end'): void {
    const visible = this.visibleNodes();
    const target = edge === 'start' ? visible[0] : visible[visible.length - 1];
    if (!target) {
      return;
    }
    this.#focusedId.set(target.id);
    this.focusNode(target.id);
  }

  private focusNode(id: string): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-tree-view, synergos-tree-view');
      const root = host?.shadowRoot ?? document;
      const cell = (root as ParentNode).querySelector<HTMLElement>(`[data-node-id="${id}"]`);
      cell?.focus();
    });
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
