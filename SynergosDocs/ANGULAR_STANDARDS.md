# Angular Standards

All code in the Synergos platform must follow these Angular 21 standards.
These rules are enforced in code review and by the LLM governance rules in `LLM.txt`.

---

## Mandatory APIs

### Use standalone components (always)

```typescript
// ✅ Correct
@Component({ standalone: true, ... })
export class MyComponent {}

// ❌ Forbidden
@NgModule({ declarations: [MyComponent] })
export class MyModule {}
```

### Use Signals for state (always)

```typescript
// ✅ Correct
readonly count = signal(0);
readonly doubled = computed(() => this.count() * 2);

// ❌ Avoid for local state
count$ = new BehaviorSubject(0);
```

### Use signal inputs (always)

```typescript
// ✅ Angular 17+ signal input
readonly label = input.required<string>();
readonly size  = input<'sm' | 'md'>('md');

// ⚠️  Acceptable (legacy input, use only for event binding compatibility)
@Input() label!: string;
```

### Use output() for events

```typescript
// ✅ Correct
readonly clicked = output<void>();
readonly selected = output<string>();

// ⚠️  Acceptable (legacy EventEmitter)
@Output() clicked = new EventEmitter<void>();
```

### Use OnPush everywhere

```typescript
// ✅ Required
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

### Use zoneless bootstrap

```typescript
// ✅ Correct
provideZonelessChangeDetection()

// ❌ Forbidden
provideZoneChangeDetection()
// and never add zone.js to polyfills
```

### Use inject() over constructor injection

```typescript
// ✅ Correct
readonly #router = inject(Router);

// ⚠️  Acceptable but verbose
constructor(private router: Router) {}
```

### Use private fields (#) for injected services

```typescript
// ✅ Correct — not part of public API
readonly #http = inject(HttpClient);
readonly #service = inject(MyService);

// ❌ Exposes services unnecessarily
public service = inject(MyService);
protected service = inject(MyService);
```

---

## Forbidden Patterns

| Pattern | Why forbidden |
|---|---|
| `NgModule` | Replaced by standalone APIs |
| `BehaviorSubject` for component state | Use Signals |
| `@Input() with ngOnChanges` only | Use `effect()` or `computed()` |
| Service calls inside components | Containers only |
| Hardcoded styles (`color: red`) | Use design tokens |
| `zone.js` | Zoneless architecture |
| `any` type | Strict TypeScript required |
| `console.log` | Use `LoggerService` |

---

## File Naming

| Type | Convention | Example |
|---|---|---|
| Foundation (libs/shared) | `<name>.ts` | `button.ts` |
| Component (libs/shared) | `<name>.ts` | `card.ts` |
| Pattern (libs/shared) | `<name>.ts` | `data-grid.ts` |
| Feature container | `<name>.container.ts` | `appointments.container.ts` |
| Feature store | `<name>.store.ts` | `appointments.store.ts` |
| Feature API | `<name>.api.ts` | `appointments.api.ts` |
| Model/interface | `<name>.model.ts` | `appointment.model.ts` |
| Route config | `<name>.routes.ts` | `appointments.routes.ts` |
| Guard | `<name>.guard.ts` | `auth.guard.ts` |
| Interceptor | `<name>.interceptor.ts` | `auth.interceptor.ts` |
| Pipe | `<name>.pipe.ts` | `date-format.pipe.ts` |
| Directive | `<name>.directive.ts` | `tooltip.directive.ts` |
| Spec | `<name>.spec.ts` | `button.spec.ts` |

---

## Component Selector Prefix

All components **must** use the `syn-` prefix:

```typescript
selector: 'syn-button'     // ✅
selector: 'button'         // ❌
selector: 'app-button'     // ❌
```

---

## Template Guidelines

- Use `@if` / `@for` / `@switch` (Angular 17+ control flow syntax)
- Never use `*ngIf`, `*ngFor` (NgModule-based directives)
- Self-close void elements: `<router-outlet />`
- Avoid template logic — delegate to `computed()` in the class

```html
<!-- ✅ Modern control flow -->
@if (loading()) {
  <syn-spinner />
} @else {
  @for (item of items(); track item.id) {
    <syn-card [data]="item" />
  }
}

<!-- ❌ Old structural directives -->
<syn-spinner *ngIf="loading$ | async"></syn-spinner>
```

---

## Reactive Patterns

### Effects for side effects (not for state derivation)

```typescript
// ✅ Effect for a side effect (document title, logging, analytics)
effect(() => {
  document.title = `${this.pageTitle()} — Synergos`;
});

// ❌ Don't use effect to derive state — use computed()
effect(() => {
  this.fullName.set(`${this.firstName()} ${this.lastName()}`);
});
```

### takeUntilDestroyed for HTTP subscriptions

```typescript
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

this.#http.get('/api/data')
  .pipe(takeUntilDestroyed())
  .subscribe(data => this.data.set(data));
```

---

## TypeScript

- `strict: true` is enabled — all types must be explicit
- No `any` — use `unknown` and narrow the type
- Private class members use `#` (private fields), not `private` keyword
- Interfaces for data models, not classes
- Use `readonly` for injected dependencies and immutable values

