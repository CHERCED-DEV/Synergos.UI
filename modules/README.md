# Synergos Modules

Each subdirectory in `modules/` is a **Git submodule** — an independent Angular repository that delivers a self-contained business feature as a mountable widget.

## Architecture

```
modules/
  services/        → @synergos/module-services
  appointments/    → @synergos/module-appointments
  ecommerce/       → @synergos/module-ecommerce
```

Each module:
- Is a separate Git repository
- Is an Angular standalone application
- Exports a `mountModule(selector, config)` function
- Can be built and deployed independently to CDN
- Is consumed by Umbraco via a Razor partial

---

## Add a new module as a Git submodule

```bash
# 1. Create the remote repo first (GitHub/GitLab/Azure DevOps)
# 2. Then register it as a submodule:
git submodule add <repo-url> modules/<module-name>
git commit -m "feat: add <module-name> module submodule"
```

Example:
```bash
git submodule add https://github.com/your-org/synergos-module-appointments modules/appointments
```

---

## Clone this workspace with all submodules

```bash
git clone --recurse-submodules <workspace-url>

# Or if already cloned:
git submodule update --init --recursive
```

---

## Update all submodules to latest

```bash
git submodule update --remote --merge
```

---

## Module contract

Every module must export the following from its entry point:

```typescript
// src/index.ts (or main.ts)

export interface ModuleConfig {
  apiBaseUrl: string;
  cdnBaseUrl?: string;
  locale?: string;
  [key: string]: unknown;
}

/**
 * Mounts the module onto a DOM element matching `selector`.
 * Called by Umbraco Razor scripts via CDN bundle.
 */
export function mountModule(selector: string, config: ModuleConfig): void {
  // bootstrapApplication(ModuleRootComponent, buildConfig(config))
  //   .catch(console.error);
}
```

---

## Consuming a module from Umbraco (Razor)

```html
<!-- In a Umbraco Razor view / partial -->
<div id="syn-appointments"></div>

<script type="module">
  import { mountModule } from 'https://cdn.example.com/synergos/appointments/latest/main.js';
  mountModule('#syn-appointments', {
    apiBaseUrl: '@Model.ApiBaseUrl',
    locale: '@Model.CurrentCulture'
  });
</script>
```
