# Integration Governance — Synergos.UI ↔ CDN ↔ Synergos.CMS

This document defines the rules and mechanisms that keep `Synergos.UI` and `Synergos.CMS`
aligned **without requiring them to run in the same pod, tenant, or CI environment**.

---

## The Fundamental Rule

**UI and CMS never talk to each other directly. The CDN is the only exchange point.**

```
Synergos.UI CI  ──publish──►  CDN  ◄──fetch──  Synergos.CMS CI
                                    ◄──fetch──  Synergos.CMS runtime
```

- UI publishes. CMS reads. Neither depends on the other's deployment state.
- The CDN is the contract made durable.

---

## Three CDN Artefacts That Govern the Integration

| File | CDN path | Who writes it | Who reads it | When |
|------|----------|---------------|--------------|------|
| `registry.json` | `/synergos/registry.json` | `publish.mjs` | CMS runtime startup | Every release |
| `contracts.json` | `/synergos/contracts.json` | `publish.mjs` | CMS CI validation | Every release |
| `manifest.json` | `/synergos/{name}/{fw}/{slot}/manifest.json` | `publish.mjs` | CMS runtime / tooling | Per element release |
| `import-map.json` | `/synergos/runtime/{slot}/import-map.json` | `publish-runtime.mjs` | CMS layout `<head>` | Runtime release |

---

## How Each Side Knows the Contract is Correct

### Synergos.UI — pre-publish gates (its own CI)

```bash
npm run contracts:validate   # element:audit + manifest:validate
npm run release              # includes contracts:validate before publish
```

These run entirely within the UI repo. No CMS needed. They verify:
- Every element in `element-registry.json` has a mapper, a model file, and declared inputs
- No element has an empty `inputs[]` array in the manifest

### Synergos.CMS — post-publish validation (its own CI)

```bash
# In CMS CI pipeline, after Synergos.UI publishes a new version:
dotnet run --project tools/ContractValidator -- \
  --contracts https://cdn.example.com/synergos/contracts.json \
  --resolvers ./Application/Rendering/Content/Resolvers/
```

Or as an integration test:

```csharp
// ContractValidatorTest.cs (CMS CI)
[Fact]
public async Task AllResolverOutputFieldsMustExistInUiContracts()
{
    var contracts = await FetchContractsAsync("https://cdn.example.com/synergos/contracts.json");

    foreach (var resolver in GetAllResolvers())
    {
        var element = contracts.Elements.FirstOrDefault(e => e.Alias == resolver.Alias)
            ?? throw new Exception($"Alias '{resolver.Alias}' not found in UI contracts.json");

        var declaredFields = element.ConfigFields.Select(f => f.Name).ToHashSet();
        var resolverFields = resolver.GetEmittedFieldNames();

        var unknown = resolverFields.Except(declaredFields).ToList();
        Assert.Empty(unknown); // CMS is passing fields UI doesn't know about
    }
}
```

**This test runs in CMS CI, reads from CDN, requires no access to the UI repo.**

---

## The `contracts.json` Format

Published to `/synergos/contracts.json` after every UI release.

```json
{
  "generated": "2026-04-02T12:00:00Z",
  "version":   "0.1.0",
  "$schema":   "synergos-contracts/v1",
  "elements": [
    {
      "name":  "hero",
      "alias": "elementCompHero",
      "tag":   "synergos-hero",
      "tier":  "module",
      "configFields": [
        { "name": "headingText", "type": "string", "required": false, "default": "" },
        { "name": "ctaUrl",      "type": "string", "required": false, "default": "" },
        { "name": "theme",       "type": "string", "required": false, "default": "light" }
      ],
      "jsonFields": ["config"]
    },
    {
      "name":  "faq-section",
      "alias": "elementCompFaqList",
      "tag":   "synergos-faq-section",
      "tier":  "module",
      "configFields": [
        { "name": "headingText", "type": "string", "required": false },
        { "name": "items",       "type": "json",   "required": false }
      ],
      "jsonFields": ["config", "items"]
    }
  ]
}
```

### What CMS should validate against this file

| Check | Severity | Why |
|-------|----------|-----|
| `alias` exists in `contracts.elements` | Error | CMS is referencing an element UI doesn't know about |
| All resolver output fields exist in `configFields` | Error | CMS is passing a field the element will ignore silently |
| Fields of type `json` are serialized (not passed as raw objects) | Error | HTML attributes are strings — objects won't be read |
| Required fields (`required: true`) are never null/empty | Warning | Element will render broken or with empty defaults |

---

## What Each Side Owns

### Synergos.UI owns:

- `element-registry.json` — the canonical mapping of name / alias / tag / tier
- `element-inputs.json` — the declared public surface of every element
- `element-config.contract.ts` — the TypeScript type of each element's config payload
- `contracts.json` on CDN — the machine-readable export of the above, for CMS to consume
- `manifest.json` on CDN — per-element, per-framework, per-version contract
- `registry.json` on CDN — global index of all elements and available versions
- CDN slot structure and naming conventions

### Synergos.CMS owns:

- Umbraco content type aliases (must match UI's `element-registry.json`)
- C# resolver DTOs (must match UI's `element-config.contract.ts`)
- `appsettings.json` → `CdnSettings` (CDN base URL, production slot, runtime slot)
- `CdnResolver` — the single constructor of all CDN URLs
- `ElementRegistryService` — reads `registry.json` at startup
- Import map injection in `<head>`
- The mapping from Umbraco content fields to the flat config DTO

### The CDN owns:

- Serving artefacts as-is without transformation
- Cache headers (immutability for exact semver slots, TTL for major/latest slots)
- CORS headers (allow CMS domain)
- No business logic. No routing. No orchestration.

---

## When to Coordinate Between Projects

### Adding a new element

| Step | Project | Action |
|------|---------|--------|
| 1 | UI | Add entry to `element-registry.json` |
| 2 | UI | Add inputs to `element-inputs.json` |
| 3 | UI | Add interface to `element-config.contract.ts` |
| 4 | UI | Build, run `contracts:validate`, publish |
| 5 | CMS | Fetch updated `contracts.json` from CDN |
| 6 | CMS | Create Umbraco content type with matching alias |
| 7 | CMS | Write C# resolver matching the new `configFields` |
| 8 | CMS | Run CMS contract validation against CDN |
| 9 | Both | Deploy independently — neither blocks the other |

### Changing an existing element (breaking change)

| Step | Project | Action |
|------|---------|--------|
| 1 | UI | Make the change (rename/remove input) |
| 2 | UI | Bump MAJOR version in `package.json` |
| 3 | UI | Publish — new v{N+1} slot created alongside v{N} |
| 4 | UI | Old v{N} slot remains untouched — CMS production is safe |
| 5 | CMS | Update C# resolver to match new field names |
| 6 | CMS | Run contract validation against `/synergos/contracts.json` |
| 7 | CMS | Update `CdnSettings.ProductionSlot` to `"v{N+1}"` |
| 8 | CMS | Deploy — now consuming the new version |

**Key point:** CMS never breaks mid-release because it stays on `v{N}` until it's ready.

---

## Deployment Independence

Both projects deploy on their own schedule, to their own infrastructure, with their own CI:

```
Synergos.UI CI:                          Synergos.CMS CI:
  git push →                               git push →
  npm run contracts:validate →               dotnet build →
  npm run release →                          ContractValidator fetches contracts.json →
  CDN updated                                Tests pass → deploy to CMS host
```

**The only dependency:** CMS CI references the CDN URL to fetch `contracts.json`.  
If the CDN is down during CMS CI, the validation step should warn (not error) and fall back
to the last known good contracts file (checked into the CMS repo as a snapshot).

### Recommended: CMS keeps a snapshot of contracts.json

```
Synergos.CMS/
  Infrastructure/
    Synergos/
      contracts.snapshot.json    ← last known good, committed to CMS repo
      contracts.snapshot.version ← version of the snapshot
```

Updated via a CMS task:
```bash
# Run in CMS repo when UI publishes a new version
dotnet run --project tools/ContractSync -- --update-snapshot
```

This ensures CMS CI still works if CDN is unreachable, and provides an auditable record of
which UI version the CMS was validated against.

---

## Rules Summary

### UI rules
1. Never publish without passing `npm run contracts:validate`
2. Every element published must have `inputs[]` declared in `element-inputs.json`
3. Breaking change (rename/remove input) = MAJOR version bump, always
4. `contracts.json` is always published alongside `registry.json` — never skip it
5. Old CDN version slots are never deleted — CMS may still depend on them

### CMS rules
1. Never hardcode CDN URLs in Razor views — use `CdnResolver`
2. Production version slot lives in `appsettings.json` only — not in code
3. Run contract validation against `contracts.json` in every CMS CI build
4. Update the CMS contracts snapshot when adopting a new UI version
5. Never pass fields to an element that don't exist in `contracts.json configFields`
6. Fields of `type: json` must be `JsonSerializer.Serialize()`d before setting as attribute

### Cross-project rules
1. Communication happens through CDN, not through direct calls or shared repos
2. UI can release at any time — CMS production is protected by version pinning
3. CMS adopts a new UI version on its own schedule — no forced upgrades
4. A major version bump in UI gives CMS time to adapt before switching `ProductionSlot`
5. Both CIs are independently green — no joint build, no joint deploy
