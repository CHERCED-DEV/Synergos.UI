# Design System

The Synergos design system is split across two libraries:

- `libs/core-assets` (`@synergos/core-assets`) — Design tokens, SCSS system
- `libs/shared` (`@synergos/shared`) — Angular components, pipes, directives, utilities

---

## Component Architecture

The component library uses a **three-tier structure** aligned with modern design systems (shadcn/ui, Radix, Material Design 3, Carbon):

```
foundations/   →  primitive, single-purpose UI building blocks
components/    →  composed, self-contained UI components
patterns/      →  complex, multi-component UI layouts and flows
```

This is more practical than classic atomic design (atoms/molecules/organisms), avoids naming ambiguity, and reflects current industry conventions.

---

### `foundations/` — Primitive building blocks

Small, single-responsibility primitives that other components build on.

**Characteristics:** single purpose, stateless, inputs control 100% of appearance, maximally reusable.

**Examples:** ButtonComponent, IconComponent, BadgeComponent, SpinnerComponent, AvatarComponent, SeparatorComponent, SkeletonComponent

```typescript
@Component({
  selector: 'syn-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: \`<button [class]="classes()" [disabled]="disabled()"><ng-content /></button>\`,
})
export class ButtonComponent {
  readonly variant  = input<'primary' | 'secondary' | 'ghost' | 'destructive'>('primary');
  readonly size     = input<'sm' | 'md' | 'lg'>('md');
  readonly disabled = input(false);

  protected readonly classes = computed(() =>
    \`syn-btn syn-btn--\${this.variant()} syn-btn--\${this.size()}\`
  );
}
```

---

### `components/` — Composed UI components

Combine foundations to deliver a complete UI unit.

**Characteristics:** composed from foundations, may have internal state (open/close, active), encapsulate complexity, no business logic, no API calls.

**Examples:** CardComponent, DialogComponent, DropdownComponent, ToastComponent, TableComponent, InputComponent, SelectComponent, TabsComponent

---

### `patterns/` — Complex multi-component layouts

Opinionated compositions that implement recurring UI patterns across the platform.

**Characteristics:** built from components + foundations, encode platform UX conventions, richer internal state (pagination, multi-step, filtering), never fetch data externally.

**Examples:** DataGridPattern, FormPattern, SearchResultsPattern, PageHeaderPattern, EmptyStatePattern, DetailPanelPattern

---

## Shared Library Structure

```
libs/shared/src/
├── foundations/       # Primitive building blocks
├── components/        # Composed UI components
├── patterns/          # Complex platform patterns
├── directives/        # Structural + attribute directives
├── pipes/             # Transformation pipes
├── utils/             # Pure TypeScript helpers
│   └── class-names.util.ts
└── index.ts           # Public API surface
```

---

## Component Contract

All design system components must be:

- `standalone: true`
- `ChangeDetectionStrategy.OnPush`
- Presentational: inputs in, outputs out
- Tokenised: design tokens only, no hardcoded values
- Prefixed with `syn-`
- Exported from `libs/shared/src/index.ts`

---

## Scaffolding a new component

```bash
# Foundation
npx nx g @nx/angular:component button --project=shared --path=libs/shared/src/foundations

# Component
npx nx g @nx/angular:component card --project=shared --path=libs/shared/src/components

# Pattern
npx nx g @nx/angular:component data-grid --project=shared --path=libs/shared/src/patterns
```

Then export from `libs/shared/src/index.ts`:

```typescript
export { ButtonComponent } from './foundations/button/button.component';
export { CardComponent }   from './components/card/card.component';
```

---

## SCSS System Setup

Add to the project's `project.json` build options:

```json
"stylePreprocessorOptions": {
  "includePaths": ["libs/core-assets/src"]
}
```

Use in component SCSS:

```scss
@use 'scss' as syn;

.syn-button {
  background: syn.$color-primary;
  padding: syn.$space-2 syn.$space-4;
  font-size: syn.$font-size-sm;
  font-weight: syn.$font-weight-medium;
  box-shadow: syn.$shadow-sm;

  &:hover { background: syn.$color-primary-hover; }

  @include syn.respond-to('md') {
    padding: syn.$space-3 syn.$space-6;
  }
}
```

### Design Tokens Reference

| Category | Tokens |
|---|---|
| Colors | `$color-primary`, `$color-surface`, `$color-border`, `$color-text`, `$color-text-muted` |
| Spacing | `$space-1` (4px) → `$space-3xl` (96px). Aliases: xs/sm/md/lg/xl/2xl/3xl |
| Typography | `$font-size-xs` → `$font-size-5xl`. `$font-weight-regular/medium/semibold/bold` |
| Shadows | `$shadow-none/xs/sm/md/lg/xl/2xl` |
| Z-index | `$z-base/raised/dropdown/sticky/overlay/modal/toast/tooltip` |

---

## Rules

- No hardcoded colours, sizes, or z-index values in any SCSS
- No business logic or API calls in design system components
- All public components exported through `libs/shared/src/index.ts`
- Patterns may have internal state (pagination, tabs) but never fetch data from APIs
