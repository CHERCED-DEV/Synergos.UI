# Synergos.UI — Guía de Problemas Operativos

> Problemas confirmados con evidencia real de código. No especulativos.
> Lectura obligatoria antes de operar el workspace.

---

## G1 — `NX_WORKSPACE_ROOT_PATH` rompe comandos Angular Nx desde la raíz

### Síntoma

```
NX  Could not find workspace root directory when running from: platforms/angular
```

O peor: el comando Nx Angular termina sin error pero actúa sobre el workspace raíz en lugar del Angular.

### Causa

El workspace raíz (`/Synergos.UI/`) tiene su propio `nx.json` y binario Nx. Cuando se ejecutan scripts raíz con `cd platforms/angular && npx nx ...`, la variable de entorno `NX_WORKSPACE_ROOT_PATH` puede quedar apuntando al directorio raíz de la sesión anterior.

**Synergos.UI tiene dos workspaces Nx completamente independientes:**
- Raíz (`/Synergos.UI/`) — maneja React, Svelte, Vanilla, vitals
- Angular (`/platforms/angular/`) — maneja todo el stack Angular

Son procesos Nx distintos con `node_modules/` aislados. Un workspace no conoce los proyectos del otro.

### Fix

Todos los scripts Angular en `package.json` raíz ya incluyen el fix:

```bash
cross-env NX_WORKSPACE_ROOT_PATH= NX_DAEMON=false npx nx ...
```

Si se ejecutan comandos Nx Angular manualmente desde la terminal:

```bash
# Siempre unset antes de nx angular
unset NX_WORKSPACE_ROOT_PATH

cd platforms/angular
npx nx run hero:build
```

### Por qué `NX_DAEMON=false`

El Nx daemon del workspace raíz y el de Angular pueden colisionar en el mismo socket. `NX_DAEMON=false` fuerza ejecución sin daemon cuando se lanza desde contexto externo. En CI o en sesiones dedicadas `cd platforms/angular`, el daemon funciona correctamente y puede activarse.

---

## G2 — `@synergos/core` resuelve diferente en Angular que en vitals

### Síntoma

Un import `from '@synergos/core'` compila en React/Svelte/vanilla pero falla en Angular (TypeScript no encuentra la función), o viceversa.

### Causa

El alias `@synergos/core` tiene dos resoluciones distintas según el `tsconfig`:

| Workspace | `@synergos/core` resuelve a | Contenido |
|---|---|---|
| Raíz (`tsconfig.base.json`) | `vitals/core/src/index.ts` | Mappers, modelos, bridge, utilidades agnósticas |
| Angular (`platforms/angular/tsconfig.json`) | `libs/core/src/index.ts` | Providers Angular, tokens, interceptors, servicios |

El workspace Angular **sobreescribe** el alias raíz. Son dos librerías distintas con el mismo nombre.

### Cuándo usar qué

| Necesitas | Usa | Disponible en |
|---|---|---|
| Mappers agnósticos (`mapBlockToElement`, `mapHeroData`, ...) | `@synergos/vitals-core` | Solo Angular (alias añadido en F1.1) |
| Providers Angular (`provideCore`, `LoggerService`, ...) | `@synergos/core` | Solo Angular |
| Mappers desde React/Svelte/vanilla | `@synergos/core` | React, Svelte, vanilla (alias raíz) |
| Interfaces de contratos | `@synergos/contracts` | Todos los frameworks |

### El alias `@synergos/vitals-core`

Añadido en `platforms/angular/tsconfig.json` como corrección del gap F1.1. Apunta directamente a `../../vitals/core/src/index.ts` y expone la API completa del core agnóstico (mappers, modelos, bridge) desde el workspace Angular.

---

## G3 — `ElementData` vs `ElementConfig`: por qué los Custom Elements solo reciben el segundo

### Síntoma

Se pasa un objeto `ElementData` (con arrays, objetos anidados, booleanos) como atributo HTML a un Custom Element y aparece como `[object Object]` o `"true"` en el DOM.

### Causa

Los atributos HTML son strings. Los Custom Elements **solo reciben strings** en sus atributos. Nunca objetos JS.

El sistema separa dos capas:

```
ElementData  →  (CMS/servidor, objetos reales)
    ↓ mapper (mapXxxData)
ElementConfig  →  (atributos HTML, todo serializado a string)
    ↓ attributeChangedCallback
Custom Element en DOM
```

**`ElementData`** es la forma "rica" que viene del CMS: arrays de items, objetos anidados, booleanos nativos. Solo existe en el servidor o en el runtime de mounting.

**`ElementConfig`** es la forma "plana" serializada: cada propiedad es un string, los arrays se serializan como JSON string, los booleanos como `"true"`/`"false"`.

### Dónde ocurre la serialización

En `vitals/core/src/mappers/`. Cada `mapXxxData()` recibe `ElementData` y devuelve `Record<string, string>` (que es `ElementConfig`). El `InputMapper` en `rendering/` aplica esos valores como atributos HTML.

### Regla

- Si construyes un mapper: **output siempre `Record<string, string>`**, nunca objetos, nunca arrays sin serializar.
- Si recibes un input en un componente Angular: **siempre `input<string>()`**, parsear internamente si necesitas el tipo real.
- Si un elemento tiene un array como input (ej: `items`), se recibe como JSON string y se parsea con `JSON.parse()` dentro del componente.

---

## G4 — Las tres rutas de rendering del CMS

### Síntoma

Un elemento "existe en Angular" pero no aparece en producción, o aparece diferente a lo esperado. El CMS no usa el Custom Element aunque está disponible en CDN.

### Causa

El CMS tiene tres rutas de rendering paralelas, no excluyentes. Un mismo elemento puede estar activo en las tres simultáneamente:

| Ruta | Vistas en CMS | Output | Quién la activa |
|---|---|---|---|
| **CDN (Custom Elements)** | `Views/Partials/Content/` | `<synergos-x config="...">` desde CDN | `IContentResolver` + `SynergosBlock.cshtml` |
| **SSR Components** | `Views/Partials/Ssr/Components/` | HTML server-rendered | Umbraco block dispatcher |
| **SSR Foundation** | `Views/Partials/Ssr/Foundation/` | Sub-componentes HTML inline | Usado dentro de vistas SSR superiores |

La mayoría de los 58 elementos registrados tienen **cobertura en las dos primeras rutas** (CDN + SSR). Que un elemento no tenga `IContentResolver` no significa que esté inactivo — puede estar en producción vía SSR.

### Cómo determinar qué ruta está activa para un elemento

1. **Ruta CDN activa:** existe `Synergos.CMS/.../Resolvers/` con una clase cuyo `SupportedAlias` coincide con el `alias` de `element-registry.json`.
2. **Ruta SSR activa:** existe un `.cshtml` en `Views/Partials/Ssr/Components/{NombreElemento}.cshtml` o en `Ssr/Foundation/`.
3. **Ambas activas:** el editor de contenido en Umbraco elige en qué modo renderizar el bloque (configuración editorial).

### Elementos sin ruta CDN activa (estado al 2026-04-03)

Elementos que tienen SSR en producción pero no tienen `IContentResolver` para CDN:
- `paragraph`, `rich-text`, `eyebrow`, `quote`, `label`, `text-block` — primitivos de texto, SSR suficiente
- `avatar` — sub-componente de otros elementos en SSR
- `accordion` — SSR activo, ruta CDN pendiente de decisión (D4)
- `pricing-card`, `stat` — implementados en React POC, SSR activo; Angular CE pendiente de decisión (D5)

---

## G5 — Gap de `Nx affected` para `vitals/` (corregido en F1.2)

### Estado actual

**Corregido.** El gap fue solucionado en la corrección F1.2 del plan de ejecución (2026-04-03).

### Qué era el problema

`vitals/` (contratos, core, core-assets, shared) no tiene `project.json` y por tanto no es visible para el workspace Nx de Angular. Antes de F1.2, un cambio en `vitals/core/src/mappers/hero.mapper.ts` no marcaba ningún proyecto Angular como `affected`. Los builds incrementales podían devolver artefactos stale si el código agnóstico cambiaba.

### Cómo fue corregido

En `platforms/angular/nx.json` se añadió un `namedInput` llamado `vitals` con globs de todos los archivos de los cuatro paquetes agnósticos:

```json
"vitals": [
  "{workspaceRoot}/../../vitals/contracts/src/**/*",
  "{workspaceRoot}/../../vitals/core/src/**/*",
  "{workspaceRoot}/../../vitals/core-assets/src/**/*",
  "{workspaceRoot}/../../vitals/shared/src/**/*"
]
```

Este input se añadió a las entradas de `@angular/build:application` y `@angular/build:unit-test` en `targetDefaults`.

### Trade-off conocido

Cualquier cambio en `vitals/` invalida **todos** los proyectos Angular (no solo los que usan ese archivo específico). Es el comportamiento correcto dado que vitals no tiene granularidad de proyectos Nx. El costo en tiempo de rebuild es bajo si Nx Cloud está activo — el remote cache cubre proyectos cuyos outputs no cambiaron realmente.

### Verificación

```bash
# Añadir una línea de comentario a cualquier mapper de vitals
echo "// test" >> vitals/core/src/mappers/hero.mapper.ts

# Verificar que Angular lo detecta como affected
cd platforms/angular
unset NX_WORKSPACE_ROOT_PATH
npx nx affected --target=build --dry-run

# Debe listar proyectos afectados. Revertir el cambio.
git checkout vitals/core/src/mappers/hero.mapper.ts
```

---

## G6 — CDN local de desarrollo (`C:\LOCAL_CDN` / `https://synergos-static-local`)

### Configuración

| Variable | Valor local | Descripción |
|---|---|---|
| `SYNERGOS_CDN` | `C:\LOCAL_CDN` | Path físico donde publish copia los archivos |
| `SYNERGOS_CDN_ORIGIN` | `https://synergos-static-local` | URL pública que se escribe en el import-map.json |

El CDN local usa IIS con `web.config` en `C:\LOCAL_CDN\`. Sirve bundles con CORS abierto, caché de 30 días, MIME types para `.json`/`.webp`/`.woff`/`.woff2`/`.map`, y compresión estática.

El dominio `https://synergos-static-local` debe estar resuelto en `hosts` hacia `127.0.0.1` y el sitio IIS debe tener un binding HTTPS para ese hostname.

### Cómo genera el import map

`publish:runtime` escribe URLs absolutas en `import-map.json` usando `SYNERGOS_CDN_ORIGIN`:

```json
{
  "imports": {
    "@angular/core": "https://synergos-static-local/synergos/runtime/angular/21.1.6/ng-core.js",
    "@angular/compiler": "https://synergos-static-local/synergos/runtime/angular/21.1.6/ng-compiler.js",
    ...
  }
}
```

Este import map se inyecta como **primer `<script>`** en `<head>` desde el CMS, antes de cualquier `<script type="module">` de elementos. Ver [CDN_RUNTIME.md](CDN_RUNTIME.md) para la secuencia completa.

### Gotcha de caché

El navegador cachea los bundles 30 días. Si publicas una nueva versión al path `/latest/`, el navegador puede servir la versión anterior.

**Workaround:**
1. Forzar recarga sin caché: `Ctrl + Shift + R`
2. O publicar siempre al path semver `/{version}/` en lugar de `/latest/`
3. O reducir `cacheControlMaxAge` en el `web.config` local

### Scripts

```bash
npm run publish:runtime   # copia runtime + regenera import-map.json con URLs absolutas
npm run publish:cdn       # copia bundles de elementos
npm run release:angular   # build completo + validate + publish runtime + publish elements
```

Para un CDN de producción real: pasar `--base https://cdn.mi-dominio.com` a `publish:runtime`, o configurar `SYNERGOS_CDN_ORIGIN` antes de ejecutar (pendiente decisión D2).
