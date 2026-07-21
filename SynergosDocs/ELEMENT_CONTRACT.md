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

Use the combined gate (runs both audit + manifest validation):

```bash
npm run contracts:validate
```

This is wired into all `npm run release:*` scripts and must pass before any publish.

---

## CDN Path Resolution

**Rule: the `name` field governs the CDN path — never the `tag`.**

The `name` and `tag` can differ:

| `name` | `tag` | CDN path |
|--------|-------|----------|
| `stat` | `synergos-stat-counter` | `/synergos/stat/angular/v1/main.js` |
| `hero` | `synergos-hero` | `/synergos/hero/angular/v1/main.js` |

`publish.mjs` uses `entry.name` to build all CDN paths. The `tag` appears only inside `manifest.json`.

**For CMS:** always use `registry.entry.name` to construct the script URL. Never strip `synergos-` from the tag to derive the path.

---

## Alias-Variant Routing

Multiple registry aliases can map to the same custom element tag. This is intentional for text primitives — they share one CDN bundle but render differently based on `variant` or `headingLevel` in the config.

| CMS alias | Custom element tag | Config to pass |
|---|---|---|
| `elementTextHeading` | `synergos-text-block` | `{ headingLevel: "h2" }` |
| `elementTextParagraph` | `synergos-text-block` | `{ variant: "paragraph" }` |
| `elementTextRichText` | `synergos-text-block` | `{ variant: "rich-text" }` |
| `elementTextEyebrow` | `synergos-text-block` | `{ variant: "eyebrow" }` |
| `elementTextQuote` | `synergos-text-block` | `{ variant: "quote" }` |
| `elementTextLabel` | `synergos-text-block` | `{ variant: "label" }` |
| `elementTextBlock` | `synergos-text-block` | `{ variant: "default" }` |
| `elementActionButton` | `synergos-button-container` | _(same tag as `button-container`)_ |

**Implications:**

- Only **one** CDN bundle exists for all text aliases: `/synergos/text-block/angular/v1/main.js`
- The CMS resolver must pass the correct `variant` or `headingLevel` in the config attribute
- Attempting to load `/synergos/heading/...` or `/synergos/paragraph/...` will 404

**When building the script URL from an alias:**

1. Resolve alias → registry entry → `entry.name`
2. Build URL: `cdn/{entry.name}/{framework}/{slot}/main.js`
3. Inject `variant` / `headingLevel` via the config payload — the bundle is already shared

---

## Two-Layer Contract Model

The integration uses two contract layers. Understanding both prevents silent mismatches.

### Layer 1 — Element Data (semantic domain model)

Defined in `vitals/contracts/src/elements.contract.ts`. Mirrors CMS domain model. Uses compositions:

```ts
interface HeroElementData {
  heading?: ContentHeading;   // { headingText, headingLevel }
  cta?:     ContentCta;       // { ctaLabel, ctaLink: Link, ctaTarget }
  media?:   ContentMedia;     // { media: Image, altText }
}
```

This is the CMS's native language — what the page API returns in `BlockConfig.data`.

### Layer 2 — Element Config (flat HTML attribute payload)

Defined in `vitals/contracts/src/element-config.contract.ts`. Flat primitive props. What the Angular component `input()` properties receive:

```ts
interface HeroElementConfig {
  headingText?: string;   // flattened from ContentHeading.headingText
  ctaLabel?:   string;    // flattened from ContentCta.ctaLabel
  ctaUrl?:     string;    // flattened from ContentCta.ctaLink.url
  imageSrc?:   string;    // flattened from ContentMedia.media.url
}
```

### The mapper (CMS responsibility)

The CMS resolver flattens Layer 1 → Layer 2 before serializing to JSON. The mapping is:

```
ContentCta.ctaLabel    → ctaLabel
ContentCta.ctaLink.url → ctaUrl       ← NOT ctaLink (the element expects a flat string)
ContentMedia.media.url → imageSrc     ← NOT a Media object
```

**Critical rule:** the element always expects the **flat** config (Layer 2). If a CMS resolver accidentally passes a `ContentCta` object where `ctaUrl: string` is expected, the field resolves to `undefined` silently.

---

## Governance Rules

### Adding a new element

1. Add entry to `vitals/contracts/src/element-registry.json`
2. Add inputs to `vitals/contracts/src/element-inputs.json`
3. Add config interface to `vitals/contracts/src/element-config.contract.ts`
4. Add model file `vitals/core/src/models/{tag-slug}-inputs.model.ts`
5. Export the model from `vitals/core/src/models/index.ts`
6. Add mapper entry in `vitals/core/src/mappers/block.mapper.ts`
7. Add element data interface to `vitals/contracts/src/elements.contract.ts`
8. Run `npm run contracts:validate` — must pass before any publish
9. Build and publish

### Changing an existing element contract

| Change type | Version bump | CMS action required |
|---|---|---|
| Add optional input | MINOR | None (element ignores unknown inputs) |
| Remove input | **MAJOR** | Update resolver to stop passing that field |
| Rename input | **MAJOR** | Update resolver field name |
| Change input type | **MAJOR** | Update resolver serialization |
| Change default value | PATCH | None |
| Bug fix, style only | PATCH | None |

### What belongs in UI vs CMS

| Concern | Owned by |
|---|---|
| `entry.name`, `entry.tag`, `entry.alias` | UI (element-registry.json) |
| `inputs[]` shape and defaults | UI (element-inputs.json) |
| CDN path structure | UI (publish.mjs) |
| `variant`, `theme` values available | UI (element documentation) |
| Content field → config field mapping | CMS (resolvers) |
| Which slot (v1 / latest) to use in production | CMS (appsettings) |
| Import map injection in `<head>` | CMS (layout partial) |
