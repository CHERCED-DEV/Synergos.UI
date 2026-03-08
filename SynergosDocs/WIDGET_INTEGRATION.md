# Widget Integration with Umbraco

This document explains how Angular modules are integrated into Umbraco CMS as widgets.

---

## How it works

```
1. Angular module is built → CDN
2. Umbraco Razor view loads the CDN bundle
3. Bundle exposes mountModule(selector, config)
4. Umbraco passes runtime config (API URLs, locale, data)
5. Angular bootstraps on a DOM element
```

The modules run as **isolated Angular applications** inside Umbraco pages — not embedded in a shared Angular shell.

---

## Widget Bundle

Each module is built as a standalone ES module:

```bash
npx nx build appointments --configuration=production
```

Output: `dist/modules/appointments/browser/main.<hash>.js`

This file is uploaded to CDN and versioned:

```
https://cdn.example.com/synergos/appointments/1.2.0/main.js
```

---

## Umbraco Razor Integration

### Basic usage

```html
@* In a Umbraco Razor view (.cshtml) *@

<div id="syn-appointments"></div>

<script type="module">
  import { mountModule } from 'https://cdn.example.com/synergos/appointments/1.2.0/main.js';

  mountModule('#syn-appointments', {
    apiBaseUrl: '@Model.ApiBaseUrl',
    locale: '@UmbracoContext.PublishedRequest?.Culture ?? "en"'
  });
</script>
```

### Razor partial for reusability

Create a Razor partial `_SynWidget.cshtml`:

```html
@model SynWidgetViewModel

<div id="@Model.Selector"></div>

<script type="module">
  import { mountModule } from '@Model.CdnUrl';
  mountModule('#@Model.Selector', @Html.Raw(Model.ConfigJson));
</script>
```

Use it in a document type template:

```html
@await Html.PartialAsync("_SynWidget", new SynWidgetViewModel {
    Selector = "syn-appointments-widget",
    CdnUrl = "https://cdn.example.com/synergos/appointments/1.2.0/main.js",
    ConfigJson = JsonSerializer.Serialize(new {
        apiBaseUrl = Configuration["Api:BaseUrl"],
        locale = Request.HttpContext.Features.Get<IRequestCultureFeature>()?.RequestCulture.Culture.Name
    })
})
```

---

## ModuleConfig

The `config` object passed to `mountModule` must conform to the module's `ModuleConfig` interface.

Minimum required:

```typescript
interface ModuleConfig {
  apiBaseUrl: string;     // API base URL for HTTP calls
  cdnBaseUrl?: string;    // CDN base URL for assets
  locale?: string;        // IETF language tag (e.g. "es", "en-US")
}
```

Each module can extend this with module-specific properties:

```typescript
interface AppointmentsConfig extends ModuleConfig {
  locationId?: string;
  staffId?: string;
  maxVisible?: number;
}
```

---

## Multiple widgets on the same page

Multiple independent Angular applications can run on the same Umbraco page. Each mounts on its own DOM element:

```html
<div id="syn-services"></div>
<div id="syn-appointments"></div>

<script type="module">
  import { mountModule as mountServices }
    from 'https://cdn.example.com/synergos/services/1.0.0/main.js';
  import { mountModule as mountAppointments }
    from 'https://cdn.example.com/synergos/appointments/1.2.0/main.js';

  const apiBase = '@Model.ApiBaseUrl';

  mountServices('#syn-services', { apiBaseUrl: apiBase });
  mountAppointments('#syn-appointments', { apiBaseUrl: apiBase });
</script>
```

---

## Versioning strategy

| Stage | CDN path |
|---|---|
| Latest stable | `/synergos/<module>/latest/main.js` |
| Pinned release | `/synergos/<module>/1.2.0/main.js` |
| Canary | `/synergos/<module>/canary/main.js` |

Umbraco document types should reference pinned versions for production stability.

---

## CORS and CSP

Configure your CDN to:

1. Allow the Umbraco domain in CORS headers
2. Add the CDN origin to Umbraco's Content Security Policy:

```
Content-Security-Policy: script-src 'self' https://cdn.example.com;
```

---

## Debugging in the Shell app

The `shell` application simulates the Umbraco host locally:

```bash
npm start  # serves on http://localhost:4200
```

You can add a route in `apps/shell/src/app/app.routes.ts` that lazy-loads a module for local testing:

```typescript
{
  path: 'appointments',
  loadChildren: () =>
    import('../../modules/appointments/src/app/app.routes')
      .then(m => m.APPOINTMENTS_ROUTES),
},
```

