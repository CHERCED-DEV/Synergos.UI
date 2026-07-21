# Frontend Foundations (`libs/core`)

The `core` library is the technical backbone of the platform. Every application and module depends on it.

**Path alias:** `@synergos/core`

---

## Responsibilities

| Concern | What it provides |
|---|---|
| Environment config | `Environment` interface, `ENVIRONMENT` token |
| Bootstrap | `provideCoreConfig(config)` factory |
| HTTP | `provideHttpClient` + interceptors |
| Auth | `authInterceptor` (bearer token attachment) |
| Logging | `LoggerService` (centralised, swappable) |
| Tokens | Typed injection tokens for all global config |

---

## File Structure

```
libs/core/src/
├── core.environment.ts    # Environment interface + defaults
├── core.providers.ts      # provideCoreConfig() factory
├── core.tokens.ts         # ENVIRONMENT injection token
├── interceptors/
│   ├── auth.interceptor.ts
│   └── index.ts
├── services/
│   ├── logger.service.ts
│   └── index.ts
└── index.ts               # Public API
```

---

## Usage

### In `app.config.ts` (app or module bootstrap)

```typescript
import { provideCoreConfig } from '@synergos/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideCoreConfig({
      environment: {
        production: false,
        apiBaseUrl: 'https://api.example.com',
        cdnBaseUrl: 'https://cdn.example.com',
      },
    }),
  ],
};
```

### Reading the environment anywhere

```typescript
import { inject } from '@angular/core';
import { ENVIRONMENT } from '@synergos/core';

@Injectable({ providedIn: 'root' })
export class MyService {
  readonly #env = inject(ENVIRONMENT);

  getData() {
    return this.http.get(`${this.#env.apiBaseUrl}/data`);
  }
}
```

### Logging

```typescript
import { inject } from '@angular/core';
import { LoggerService } from '@synergos/core';

readonly #logger = inject(LoggerService);

this.#logger.info('Component initialised', { id: this.id() });
this.#logger.error('Request failed', error);
```

---

## Environment Configuration

```typescript
export interface Environment {
  production: boolean;
  apiBaseUrl: string;
  cdnBaseUrl: string;
}
```

Each app/module provides its own environment at bootstrap time via `provideCoreConfig`. This keeps the `core` library environment-agnostic.

---

## Interceptors

### `authInterceptor`

Attaches `Authorization: Bearer <token>` to requests targeting `env.apiBaseUrl`. Requests to external origins are passed through unchanged.

**Wire it up:**

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from '@synergos/core';

provideHttpClient(withInterceptors([authInterceptor]))
```

---

## Adding New Infrastructure

When adding to `libs/core`:

1. Create the file under the relevant subfolder (`services/`, `interceptors/`, etc.)
2. Export it from the subfolder's `index.ts`
3. The root `index.ts` already re-exports all subfolders — no change needed there

**Rule:** `libs/core` must never import from `libs/shared` or any feature module.

