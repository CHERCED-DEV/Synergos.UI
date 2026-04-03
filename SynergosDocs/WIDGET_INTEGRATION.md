# Widget Integration with Umbraco

This document explains how Synergos Web Components are integrated into Umbraco CMS pages.

---

## How it works

```
1. Element is built → CDN  (main.js + manifest.json per element per framework)
2. Umbraco CMS resolver maps content properties → typed config JSON
3. Razor view emits <synergos-*> Custom Element tag with config as HTML attribute
4. CDN bundle boots the Angular element → renders in the browser
```

Elements are **Custom Elements (Web Components)**, not Angular applications. They work in any HTML context — Umbraco, plain HTML, or preview tools — without a host framework.

---

## Three Rendering Modes

### MODO 1 — SSR Razor (structured attributes)

The CMS resolver serializes content fields to individual HTML attributes. Angular resolves each attribute with `coerceConfigInput` / `resolveConfigValue`.

```html
@* In a Umbraco Razor view (.cshtml) *@
<script src="https://cdn.example.com/synergos/hero/angular/latest/main.js" defer></script>

<synergos-hero
  heading-text="@Model.HeadingText"
  body="@Model.Body"
  cta-label="@Model.CtaLabel"
  cta-url="@Model.CtaUrl"
  variant="@Model.Variant"
  theme="@Model.Theme">
</synergos-hero>
```

**Best for:** simple elements with few primitive inputs, server-side rendering, and SEO-sensitive content.

---

### MODO 2 — CDN direct attributes (JS-driven)

The same Custom Element tag, but attributes are set by JavaScript at runtime (e.g., from a JS config object or a headless API response).

```html
<script src="https://cdn.example.com/synergos/banner-slider/angular/latest/main.js" defer></script>

<synergos-banner-slider id="my-slider"></synergos-banner-slider>

<script>
  const el = document.getElementById('my-slider');
  el.setAttribute('items', JSON.stringify(slidesArray));
  el.setAttribute('theme', 'dark');
</script>
```

**Best for:** dynamically fetched data, A/B testing overrides, or CMS-agnostic scenarios.

---

### MODO 3 — CMS `data-config` JSON (preferred for complex elements)

The CMS resolver serializes the full config as a single JSON blob into the `config` attribute. Angular's `coerceConfigInput<T>` parses it into a typed `Partial<TElementConfig>` object.

```html
<script src="https://cdn.example.com/synergos/feature-grid/angular/latest/main.js" defer></script>

<synergos-feature-grid
  config='@Html.Raw(configJson)'>
</synergos-feature-grid>
```

Where `configJson` is produced by a C# resolver:

```csharp
// Synergos.CMS/Application/Rendering/Content/Resolvers/FeatureGridResolver.cs
var config = new {
    headingText = content.Value<string>("headingText"),
    theme       = content.Value<string>("theme"),
    items       = content.Value<IEnumerable<IPublishedElement>>("items")
                         .Select(item => new {
                             headingText = item.Value<string>("headingText"),
                             body        = item.Value<string>("body"),
                             icon        = item.Value<MediaWithCrops>("icon")?.Src()
                         })
};
var configJson = JsonSerializer.Serialize(config);
```

**Best for:** collection modules (`feature-grid`, `faq-section`, `banner-slider`, etc.) and any element with nested data. **This is the preferred mode for complex CMS-driven elements.**

---

## Embedded Approach (Enfoque B)

Synergos uses **Enfoque B** — CMS declarative config → typed resolver → typed Angular element:

| Aspect | Enfoque A (rejected) | Enfoque B (current) |
|--------|----------------------|----------------------|
| Config source | Host dynamically builds and mounts elements at runtime | CMS resolver statically maps content → JSON config |
| Type safety | Minimal — string maps, runtime-only | Strong — `ElementConfigMap`, `CtaGroupElementConfig`, etc. |
| Testability | Hard — requires a live host | Easy — resolvers are plain C# units |
| CMS editing | Disconnected from Umbraco content types | Umbraco properties map 1:1 to contract fields |
| CDN coupling | Host must know element internals | CDN agnostic — element receives final config as-is |

The contracts in `vitals/contracts/src/element-config.contract.ts` are the authoritative source that both the CMS resolvers (C#) and Angular elements (TS) must satisfy.

---

## Umbraco Razor Partial

Create a reusable Razor partial `_SynElement.cshtml`:

```html
@model SynElementViewModel

<script src="@Model.ScriptUrl" defer></script>
<@Model.TagName config='@Html.Raw(Model.ConfigJson)'></@Model.TagName>
```

Use it in a document type template:

```csharp
// Controller / ViewModel
var vm = new SynElementViewModel {
    TagName   = "synergos-feature-grid",
    ScriptUrl = $"https://cdn.example.com/synergos/feature-grid/angular/latest/main.js",
    ConfigJson = JsonSerializer.Serialize(featureGridConfig)
};
```

---

## CDN Script Loading

Each element has a versioned CDN slot:

```
https://cdn.example.com/synergos/{element}/{framework}/latest/main.js    ← always newest
https://cdn.example.com/synergos/{element}/{framework}/v1/main.js         ← pinned major
https://cdn.example.com/synergos/{element}/{framework}/0.2.0/main.js      ← pinned semver
```

**`{element}` is the `name` field from `element-registry.json`, not the tag.**  
`name="stat"` → path is `/synergos/stat/angular/v1/main.js` (not `stat-counter`).

Load elements lazily (defer) so they don't block page rendering:

```html
<script src="...main.js" defer></script>
```

Multiple elements on the same page each load their own bundle:

```html
<script src=".../synergos/hero/angular/latest/main.js" defer></script>
<script src=".../synergos/feature-grid/angular/latest/main.js" defer></script>

<synergos-hero config='@Html.Raw(heroConfig)'></synergos-hero>
<synergos-feature-grid config='@Html.Raw(featureGridConfig)'></synergos-feature-grid>
```

---

## CMS Integration Pattern (Synergos.CMS)

This section defines how `Synergos.CMS` must implement its side of the contract. The CDN URL and version slot must **never be hardcoded** in Razor views — they must come from a single `CdnSettings` configuration.

### CdnSettings in appsettings.json

```json
{
  "Synergos": {
    "CdnBaseUrl":     "https://cdn.example.com/synergos",
    "ProductionSlot": "v1",
    "StagingSlot":    "latest",
    "RuntimeSlot":    "v1",
    "Framework":      "angular"
  }
}
```

- `ProductionSlot` is the **only place** where the production version is configured.
- Changing the pinned major in production = change this value, redeploy CMS — no code change.

### CdnResolver service

```csharp
public class CdnResolver(IOptions<SynergosSettings> opts)
{
    private readonly SynergosSettings _s = opts.Value;

    public string Element(string name, string? slot = null)
        => $"{_s.CdnBaseUrl}/{name}/{_s.Framework}/{slot ?? _s.ProductionSlot}/main.js";

    public string Runtime(string file, string? slot = null)
        => $"{_s.CdnBaseUrl}/runtime/{slot ?? _s.RuntimeSlot}/{file}";

    public string Registry()
        => $"{_s.CdnBaseUrl}/registry.json";
}
```

**`name`** is always `registry.entry.name` — the short slug, not the tag. The resolver owns this construction. No other class builds CDN URLs.

### ElementRegistryService — dynamic element discovery

Instead of hardcoding the list of elements in every Razor file, the CMS reads the CDN `registry.json` at startup:

```csharp
public class ElementRegistryService(CdnResolver cdn, IMemoryCache cache) : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        // Falls back to embedded element-registry.json if CDN unreachable
        var json = await FetchWithFallback(cdn.Registry(), ct);
        cache.Set("syn:registry", ParseRegistry(json), TimeSpan.FromHours(1));
    }

    public string? ResolveTag(string alias)
        => GetRegistry()?.Elements.FirstOrDefault(e => e.Alias == alias)?.Tag;

    public string? ResolveName(string alias)
        => GetRegistry()?.Elements.FirstOrDefault(e => e.Alias == alias)?.Name;
}
```

Usage in a page resolver:

```csharp
var entry   = _registry.Resolve(block.Type); // alias → { name, tag }
var url     = _cdn.Element(entry.Name);       // CDN URL from CdnResolver
var config  = _heroResolver.Resolve(data);    // CMS content → flat config DTO
var json    = JsonSerializer.Serialize(config);

return new ContentElement {
    Tag        = entry.Tag,
    ScriptUrl  = url,
    ConfigJson = json
};
```

### Import map injection (CDN mode)

Angular element bundles built in CDN mode externalize `@angular/core` and `@synergos/shared`. The browser resolves these via an **import map** that must be injected in `<head>` **before** any element `<script>` tag.

```csharp
// ImportMapService.cs — fetches and caches the import-map.json from CDN
public class ImportMapService(CdnResolver cdn, IMemoryCache cache)
{
    public async Task<string> GetJsonAsync(CancellationToken ct = default)
        => await cache.GetOrCreateAsync("syn:import-map", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
            return await http.GetStringAsync(cdn.Runtime("import-map.json"), ct);
        });
}
```

```razor
@* _SynLayout.cshtml — inject FIRST in <head>, before any element scripts *@
<script type="importmap">@Html.Raw(await importMapService.GetJsonAsync())</script>
```

**Order in `<head>` is mandatory:**
1. `<script type="importmap">` ← import map first
2. Runtime bundle scripts (ng-core.js, sg-shared.js, etc.)
3. Element bundle scripts (`defer`)

If the import map is missing or loaded after element scripts, the element bundles will fail to resolve `@angular/core` and throw module errors.

### Deduplication — load each element bundle once per page

When the same element type appears multiple times in a page, its bundle must only be loaded once:

```razor
@* _SynElement.cshtml *@
@if (ViewContext.HttpContext.Items.TryAdd($"syn:{Model.Name}", true))
{
    <script src="@Model.ScriptUrl" type="module" defer></script>
}
<@Model.Tag config='@Html.Raw(Model.ConfigJson)'></@Model.Tag>
```

### Error handling

| Failure | CMS behaviour |
|---|---|
| Bundle 404 | Log warning. Do not emit `<script>` for that element. Render `<div data-syn-error="bundle-missing" data-syn-tag="@tag">` as placeholder. |
| `registry.json` unreachable at startup | Use embedded fallback (`element-registry.json` shipped with CMS build). Log warning. |
| `import-map.json` unreachable | Log error. Page will render HTML but Angular elements will not boot. Monitor this path. |
| `configJson` is null or empty | Emit `config='{}'` — the element renders with its default values. |

---

## CORS and CSP

Configure the CDN to allow the Umbraco domain:

```
Access-Control-Allow-Origin: https://your-umbraco-domain.com
```

Add the CDN origin to Umbraco's Content Security Policy:

```
Content-Security-Policy: script-src 'self' https://cdn.example.com;
```

---

## Local Development

To test an element locally before publishing:

```bash
# Build a specific element
cd platforms/angular
unset NX_WORKSPACE_ROOT_PATH && node_modules/.bin/nx run elements-modules-feature-grid:build

# The output is at: dist/feature-grid/main.js
# Serve locally with any static server:
npx serve dist/feature-grid --port 4300
```

Then reference it in a local HTML test file:

```html
<script src="http://localhost:4300/main.js" defer></script>
<synergos-feature-grid config='{"headingText":"Test","items":[]}'></synergos-feature-grid>
```

See `BUILD_PIPELINE.md` for the full build and publish workflow.
