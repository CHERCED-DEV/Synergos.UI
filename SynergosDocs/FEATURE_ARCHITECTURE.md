# Feature Architecture

Feature modules implement business functionality. They sit in `modules/` and follow a consistent internal structure.

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
│   ├── main.ts              # standalone bootstrap
│   └── index.ts             # mountModule export
└── project.json
```

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

