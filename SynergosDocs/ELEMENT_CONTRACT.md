# Element Contract — CDN ↔ CMS Interface

This document defines the formal contract between the Synergos.UI Web Component factory and its consumers (Umbraco, preview tools, CI validators).

---

## The Three Roles

```
┌─────────────────┐    script tag + tag name    ┌─────────────────┐
│   Umbraco CMS   │ ──────────────────────────► │   Custom Element │
│  (orchestrator) │ ◄── HTML attributes (inputs) │  (encapsulates  │
└─────────────────┘                             │   behavior)      │
        │                                       └─────────────────┘
        │ reads                                          ▲
        ▼                                               built by
┌─────────────────┐
│  CDN registry   │  registry.json + manifest.json
│  (distributor)  │  ← produced by publish.mjs
└─────────────────┘
```

| Role | Responsibility |
|------|----------------|
| **Web Component** | Encapsulates HTML, behavior, styles. Knows nothing about Umbraco. |
| **CDN** | Distributes versioned bundles. Provides manifest.json for discovery. |
| **Umbraco** | Orchestrates content. Loads scripts. Passes data as HTML attributes. |

---

## CDN Directory Structure

```
/synergos/
  registry.json                            ← Master index of all elements + versions
  {element}/
    {framework}/
      latest/
        main.js                            ← Always points to the newest version
        manifest.json
      v{major}/                            ← Major-pinned slot (stable for production)
        main.js
        manifest.json
      {semver}/                            ← Exact version (immutable, for debugging)
        main.js
        manifest.json
```

**URL examples:**
```
/synergos/hero/angular/v1/main.js         ← Production: locked to major v1
/synergos/hero/angular/latest/main.js     ← Staging: always latest release
/synergos/hero/react/v0/main.js           ← Production: React hero at v0
```

---

## manifest.json Schema

Every element + framework combination has a `manifest.json` co-located with `main.js`.

```json
{
  "tag":         "synergos-hero",
  "alias":       "elementCompHero",
  "framework":   "angular",
  "version":     "1.2.3",
  "tier":        "module",
  "entryScript": "main.js",
  "inputs": [
    { "name": "headingText",  "type": "string",  "required": false, "default": "",      "description": "Main heading text" },
    { "name": "headingLevel", "type": "string",  "required": false, "default": "h1",    "description": "HTML heading tag: h1–h6" },
    { "name": "variant",      "type": "string",  "required": false, "default": "default","description": "Layout variant key" },
    { "name": "theme",        "type": "string",  "required": false, "default": "light", "description": "Color theme (light | dark)" }
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `tag` | string | Custom Element tag name (`synergos-*`) |
| `alias` | string | Umbraco content type alias (`elementComp*`) |
| `framework` | string | `angular` \| `react` \| `svelte` \| `vanilla` |
| `version` | string | Full semver (e.g. `"1.2.3"`) |
| `tier` | string | `primitive` \| `composition` \| `module` |
| `entryScript` | string | Always `"main.js"` |
| `inputs` | array | Declared public inputs (see below) |

### Input Descriptor Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | camelCase property name (e.g. `headingText`) |
| `type` | string | ✅ | `string` \| `boolean` \| `number` \| `json` |
| `required` | boolean | ✅ | Whether the element needs this input to work |
| `default` | any | ❌ | Default value when attribute is absent |
| `description` | string | ❌ | Human-readable description |

> **Convention:** `name` in camelCase → HTML attribute in kebab-case.  
> e.g. `headingText` → `heading-text`, `imageSrc` → `image-src`

---

## registry.json Schema

The top-level registry file lists all elements and their available implementations.

```json
{
  "generated": "2026-04-01T12:00:00Z",
  "version": "1.0.0",
  "baseUrl": "/synergos",
  "elements": [
    {
      "name": "hero",
      "alias": "elementCompHero",
      "tag": "synergos-hero",
      "tier": "module",
      "implementations": {
        "angular": { "latest": "1.2.3", "v1": "1.2.3" },
        "react":   { "latest": "0.3.0", "v0": "0.3.0" }
      }
    }
  ]
}
```

---

## How Umbraco Consumes Elements

### Strategy 1 — Direct script (recommended for known elements)

Use this when the Razor template knows exactly which element to render:

```html
<!-- _Hero.cshtml -->
@{
    var cdnBase = "/synergos";
    var version = "v1";  // pin to major for production stability
}

<script src="@cdnBase/hero/angular/@version/main.js" defer></script>

<synergos-hero
  heading-text="@Model.Title"
  body="@Model.Description"
  image-src="@Model.Image?.Url()"
  image-alt="@Model.Image?.Name"
  cta-label="@Model.CtaLabel"
  cta-url="@Model.CtaUrl"
  variant="@Model.Variant"
  theme="@(Model.DarkBackground ? "dark" : "light")"
></synergos-hero>
```

### Strategy 2 — macro-host (for dynamic page-builder layouts)

Use this when Umbraco assembles pages from blocks and the template doesn't know which element to render at compile time:

```html
<!-- _DynamicBlock.cshtml -->
<script src="/synergos/macro-host/angular/v1/main.js" defer></script>

<synergos-macro-host
  content-type="@Model.ContentTypeAlias"
  content-data='@Html.Raw(Model.ToJson())'
></synergos-macro-host>
```

`macro-host` reads `contentType` (the Umbraco alias like `elementCompHero`) and `contentData` (JSON string), resolves the corresponding `synergos-*` tag, and mounts the element dynamically.

> **Requirement:** The element's bundle must be pre-loaded on the page before `macro-host` tries to mount it. Load all required element scripts at the top of the layout template.

---

## Input Data Rules

| Rule | Rationale |
|------|-----------|
| All inputs are HTML attributes | Framework-agnostic; no JavaScript API required |
| camelCase → kebab-case mapping | HTML attributes are case-insensitive; Angular Elements handles this automatically |
| JSON inputs as serialized strings | Complex data (arrays, objects) must be `JSON.stringify`-ed before setting as attribute |
| No CMS-specific inputs | Elements must not have inputs like `cmsDocumentId` or `umbracoNodeId` — only presentational data |
| No fetch inside elements | Elements never call APIs themselves; all data arrives via attributes |
| Boolean attributes use string `"true"`/`"false"` | HTML attribute values are strings; Angular Elements handles `booleanAttribute` transform |

---

## Declaring Element Inputs

Input descriptors live in `vitals/contracts/src/element-inputs.json`.

**When to update this file:**
- When you add a new `input()` property to a component
- When you rename or remove an input
- When a new element is registered in `element-registry.json`

```jsonc
// vitals/contracts/src/element-inputs.json
{
  "my-element": [
    { "name": "title",   "type": "string",  "required": true,  "description": "Element heading" },
    { "name": "variant", "type": "string",  "required": false, "default": "default" },
    { "name": "items",   "type": "json",    "required": false, "default": "[]", "description": "JSON array of items" }
  ]
}
```

---

## Versioning Policy

| Version slot | Path | When to use |
|---|---|---|
| `latest` | `/synergos/{el}/{fw}/latest/` | Development, staging, preview |
| `v{major}` | `/synergos/{el}/{fw}/v1/` | Production — stable within a major |
| `{semver}` | `/synergos/{el}/{fw}/1.2.3/` | Debugging, rollback reference |

**Breaking change = major bump.**  
A breaking change is any of:
- Removing an input
- Renaming an input
- Changing an input's `type`
- Changing an input from optional to required

Non-breaking changes (minor/patch):
- Adding a new optional input
- Changing a default value
- Fixing rendering bugs
- Adding a new variant/theme value

---

## CI Validation

Run manifest generation as a CI check:

```bash
# Generate manifests for all elements
node tools/manifest-gen.mjs --version $VERSION --out dist/manifests

# Fail if any element has no declared inputs
node tools/manifest-gen.mjs --validate
```

Add to package.json:
```json
"validate:manifests": "node tools/manifest-gen.mjs --validate"
```
