# Module Creation Guide

This guide explains how to create a new Synergos module — either directly inside the monorepo or as a standalone Git submodule.

---

## Option A — Module inside the monorepo

Use this during early development when the module is not yet mature enough to be extracted.

### 1. Generate the application

```bash
npx nx g @nx/angular:app <module-name> --directory=modules
```

Example:

```bash
npx nx g @nx/angular:app appointments --directory=modules
```

### 2. Structure the module

```
modules/appointments/src/app/
├── containers/
├── organisms/
├── molecules/
├── services/
├── models/
├── app.config.ts
└── app.routes.ts
```

### 3. Configure the module

In `app.config.ts`:

```typescript
import { provideCoreConfig } from '@synergos/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideCoreConfig({
      environment: {
        production: false,
        apiBaseUrl: '',
        cdnBaseUrl: '',
      },
    }),
  ],
};
```

### 4. Expose the mount function

In `src/index.ts`:

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { ApplicationConfig } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

export interface ModuleConfig {
  apiBaseUrl: string;
  cdnBaseUrl?: string;
  locale?: string;
}

export function mountModule(selector: string, config: ModuleConfig): void {
  const mergedConfig: ApplicationConfig = {
    providers: [
      ...appConfig.providers,
      // Override environment from config
    ],
  };
  bootstrapApplication(App, mergedConfig).catch(console.error);
}
```

---

## Option B — Module as a Git submodule (recommended for production)

Use this when the module is ready to be deployed independently.

### 1. Create the module repo

Create a new repository (GitHub / GitLab / Azure DevOps).

### 2. Register as a submodule

```bash
git submodule add <repo-url> modules/<module-name>
git commit -m "feat: register <module-name> module as submodule"
```

Example:

```bash
git submodule add https://github.com/org/syn-module-appointments modules/appointments
```

### 3. Clone with all submodules

```bash
git clone --recurse-submodules <workspace-url>

# Or if already cloned:
git submodule update --init --recursive
```

### 4. Update submodule to latest

```bash
cd modules/appointments
git pull origin main
cd ../..
git add modules/appointments
git commit -m "chore: update appointments module to latest"
```

---

## Module Contract

Every module **must** export the following from its entry point (`src/index.ts`):

```typescript
export interface ModuleConfig {
  apiBaseUrl: string;
  cdnBaseUrl?: string;
  locale?: string;
  [key: string]: unknown;
}

export function mountModule(selector: string, config: ModuleConfig): void;
```

This is the contract used by Umbraco to mount the widget.

---

## Build and Deploy

```bash
# Build a specific module
npx nx build <module-name>

# Output: dist/modules/<module-name>/browser/
# Deploy the contents of this folder to CDN
```

CDN URL pattern:

```
https://cdn.example.com/synergos/<module>/<version>/main.js
```

---

## Checklist for a new module

- [ ] App/project created with `nx g @nx/angular:app`
- [ ] `provideCoreConfig` wired in `app.config.ts`
- [ ] `mountModule` exported from `src/index.ts`
- [ ] `stylePreprocessorOptions.includePaths` set for SCSS tokens
- [ ] Containers and services created inside `src/app/`
- [ ] Design system components consumed from `@synergos/shared`
- [ ] Module added to `modules/README.md`

