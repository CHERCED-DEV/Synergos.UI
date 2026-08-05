# Feature Architecture

This document covers two related architecture patterns:

1. **Feature modules** — Angular business-domain applications in `modules/`
2. **Cross-framework experiences** — interactive Web Components in `apps/experiences/` (all frameworks)

Both follow a layered architecture that separates domain logic from UI concerns.

---

## Principles

1. **Feature-first** — code is organised by business domain, not by technical type
2. **Separated concerns** — container (wires), store (state), api (HTTP), view (UI)
3. **Strict data flow** — data flows down only; events bubble up only
4. **API isolation** — only the api file makes HTTP calls; containers and stores never touch HTTP directly
5. **Microfrontend-ready** — each module can become an independent deployable unit

---

## Feature File Structure

Each feature is expressed in four focused files:

| File | Responsibility |
|---|---|
| `feature.container.ts` | Wires store + API to the view. Handles user events. |
| `feature.store.ts` | Signal-based state. Exposes readonly signals + computed. |
| `feature.api.ts` | HTTP calls only. Returns `Observable<T>`. No state. |
| `feature.routes.ts` | Route configuration for the feature. |
| `feature.view.html` | _(Optional)_ External template when it grows large. |

### Container

Orchestrates the feature. Thin template — delegates all UI to patterns and foundations from `libs/shared`.

**Rules:**
- Inject store and api, not HttpClient directly
- One container per route/view
- Template uses only design system components (patterns, foundations, components)

```typescript
// appointments.container.ts
@Component({
  selector: 'syn-appointments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataGridPattern, SpinnerFoundation],
  template: `
    @if (loading()) {
      <syn-spinner />
    } @else {
      <syn-data-grid
        [rows]="appointments()"
        (rowAction)="onCancel($event)"
      />
    }
  `,
})
export class AppointmentsContainer {
  readonly #store = inject(AppointmentsStore);
  readonly #api   = inject(AppointmentsApi);

  readonly appointments = this.#store.items;
  readonly loading      = this.#store.loading;

  constructor() { this.#store.load(this.#api); }

  onCancel(id: string): void { this.#store.cancel(id, this.#api); }
}
```

### Store

Owns the signal state. The only place where state is mutated.

```typescript
// appointments.store.ts
@Injectable({ providedIn: 'root' })
export class AppointmentsStore {
  readonly #items   = signal<Appointment[]>([]);
  readonly #loading = signal(false);
  readonly #error   = signal<string | null>(null);

  readonly items   = this.#items.asReadonly();
  readonly loading = this.#loading.asReadonly();
  readonly error   = this.#error.asReadonly();
  readonly count   = computed(() => this.#items().length);

  load(api: AppointmentsApi): void {
    this.#loading.set(true);
    api.getAll()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next:  data => { this.#items.set(data); this.#loading.set(false); },
        error: err  => { this.#error.set(err.message); this.#loading.set(false); },
      });
  }
}
```

### API

HTTP only. No state, no signals.

```typescript
// appointments.api.ts
@Injectable({ providedIn: 'root' })
export class AppointmentsApi {
  readonly #http = inject(HttpClient);
  readonly #env  = inject(ENVIRONMENT);

  getAll(): Observable<Appointment[]> {
    return this.#http.get<Appointment[]>(`${this.#env.apiBaseUrl}/appointments`);
  }

  cancel(id: string): Observable<void> {
    return this.#http.delete<void>(`${this.#env.apiBaseUrl}/appointments/${id}`);
  }
}
```

---

## Data Flow

```
AppointmentsApi  (HTTP)
    ↓ Observable<T>
AppointmentsStore (signal state)
    ↓ readonly signal / computed
AppointmentsContainer
    ↓ input()
Pattern / Component / Foundation (libs/shared)
    ↑ output()  (events bubble UP)
```

**Forbidden patterns:**
- ❌ Foundation or component calling a service
- ❌ API file holding signal state
- ❌ Store making HTTP calls directly (delegate to api)
- ❌ Container with complex HTML — delegate to patterns from libs/shared
- ❌ Sibling containers communicating directly

---

## Module Structure

```
modules/appointments/
├── src/
│   ├── app/
│   │   ├── appointments.container.ts    # wires store + api + view
│   │   ├── appointments.container.spec.ts
│   │   ├── appointments.store.ts        # signal state
│   │   ├── appointments.store.spec.ts
│   │   ├── appointments.api.ts          # HTTP calls
│   │   ├── appointments.api.spec.ts
│   │   ├── appointments.model.ts        # interfaces
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── main.ts              # standalone bootstrap — y el build lo descubre por AQUÍ
│   └── index.ts             # mountModule export
```

> No hay `project.json`: el build encuentra los elementos recorriendo el
> filesystem — cada carpeta bajo `apps/` con un `src/main.ts` es un elemento, y el
> nombre de la carpeta es su nombre en `dist/`. No hay registro que actualizar.

Large modules with multiple views can add subfolders per view:

```
src/app/
├── list/
│   ├── list.container.ts
│   ├── list.store.ts
│   └── list.api.ts
└── detail/
    ├── detail.container.ts
    ├── detail.store.ts
    └── detail.api.ts
```

---

## State Management with Signals

Use Angular Signals as the default state mechanism.

The store/api split keeps concerns cleanly separated:

- **Store** — owns signals, exposes readonly state, orchestrates mutations
- **API** — pure HTTP, returns `Observable<T>`, holds no state

This is intentionally simpler than NgRx/Akita. For complex async flows, store methods accept the api as a parameter to keep the store unit-testable without HTTP.

```typescript
// In the store, a mutation method calls api and updates state
cancel(id: string, api: AppointmentsApi): void {
  api.cancel(id)
    .pipe(takeUntilDestroyed())
    .subscribe(() => {
      this.#items.update(items => items.filter(a => a.id !== id));
    });
}
```

---

## Routes

Each module owns its routes. Lazy-loaded into the shell (or mounted standalone):

```typescript
// app.routes.ts inside a module
export const APPOINTMENTS_ROUTES: Routes = [
  {
    path: '',
    component: AppointmentsListContainer,
  },
  {
    path: ':id',
    component: AppointmentDetailContainer,
  },
];
```

---

## Evolving to Microfrontend

When a feature module grows large enough, it can be extracted:

1. Move `modules/<name>/` to its own Git repository
2. Register as a submodule: `git submodule add <url> modules/<name>`
3. The `mountModule` export is already the contract — no changes needed in Umbraco

---

---

# Cross-Framework Experience Architecture

Experiences are complex interactive Web Components in `apps/experiences/`. They follow the same **domain / application / infrastructure / interface** layering regardless of framework.

## Folder structure (all frameworks)

```
src/<experience-name>/
├── domain/           → Pure types, constants, pure functions. No framework imports.
├── application/      → State and business logic. Framework-idiomatic.
├── infrastructure/   → Config interface + adapter. CMS raw data → typed domain model.
└── interface/        → UI component. No business rules — only rendering.
```

## Layer rules

| Layer | Imports allowed | Never imports |
|-------|----------------|---------------|
| `domain/` | Nothing (pure TS) | Any framework |
| `application/` | `domain/`, framework state primitives | HTTP, DOM, `infrastructure/` |
| `infrastructure/` | `domain/` (types only) | `application/`, any framework |
| `interface/` | All three layers, framework UI | Nothing external |

## Angular experience

State lives in a plain class using Angular signals. Use-cases are standalone functions that receive the state instance:

```typescript
// application/journey.state.ts
export class JourneyState {
  readonly activeIndex = signal(0);
  readonly isFirst = computed(() => this.activeIndex() === 0);
}

// application/use-cases/navigate-step.ts
export function nextStep(state: JourneyState): void {
  if (!state.isLast()) state.activeIndex.update(i => i + 1);
}

// interface/feature-journey.ts
@Component({ ... })
export class FeatureJourneyComponent {
  readonly #state = new JourneyState();
  next(): void { nextStep(this.#state); }
}
```

## React experience

State lives in custom hooks using `useState` or `useReducer`. Multi-step flows use `useReducer`:

```typescript
// application/quiz.state.ts
export function useQuizState(questions: QuizQuestion[]): QuizState {
  const [state, dispatch] = useReducer(quizReducer, initialState);
  return { ...state, start, answer, restart };
}

// interface/QuizFlow.tsx
export function QuizFlow({ config = '' }: QuizFlowProps) {
  const logger = useLogger('quiz-flow');          // hook, not module-level
  const { questions } = adaptQuizConfig(parsed);
  const { phase, answer } = useQuizState(questions);
  // ...
}
```

> Use `useLogger` (React hook) inside the component, not `createLogger` at module level.

## Svelte experience

State uses Svelte 5 runes (`$state`, `$derived`, `$derived.by`). Config parsing goes in `$derived.by` to stay reactive:

```svelte
<svelte:options customElement="synergos-filter-board" />
<script lang="ts">
  let { config = '' }: { config?: string } = $props();

  const instance = $derived.by(() => adaptFilterConfig(JSON.parse(config || '{}')));
  let activeTag = $state<string | null>(null);
  const filteredItems = $derived(filterByTag(instance.items, activeTag));
</script>
```

The `main.ts` entry just imports the `.svelte` file — Svelte's compiler registers the custom element automatically:

```typescript
import './filter-board/interface/FilterBoard.svelte';
```

## Vanilla JS experience

State lives in a class with a pub-sub subscribe/notify pattern. The `interface/` render function returns a cleanup function:

```typescript
// application/countdown.state.ts
export class CountdownState {
  start(): () => void {
    this.#interval = setInterval(() => { /* tick */ }, 1000);
    return () => this.stop();
  }
  subscribe(listener: CountdownListener): () => void { /* ... */ }
}

// interface/countdown-clock.ts
export function render(host: ShadowRoot, state: CountdownState, label: string, theme: string): () => void {
  const unsubscribe = state.subscribe(update);
  const stopInterval = state.start();
  return () => { unsubscribe(); stopInterval(); };
}

// main.ts — store cleanup, call on disconnect/re-render
disconnectedCallback() { this.#cleanup?.(); }
```

## The `config` contract

All experiences receive a single `config` JSON attribute. The infrastructure adapter is the only place that knows the CMS contract:

```typescript
// infrastructure/quiz.adapter.ts
export function adaptQuizConfig(raw: Partial<QuizConfig> | undefined): QuizInstance {
  return {
    title: raw?.title ?? '',
    questions: (raw?.questions ?? []).map(q => ({ ... })),
    theme: raw?.theme ?? 'light',
  };
}
```

This means: CMS contract changes → only the adapter changes. Domain and interface are untouched.

---

> For the full experiences catalog, creation guide, and per-framework examples, see [EXPERIENCES.md](EXPERIENCES.md).

