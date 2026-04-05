# Dev CDN Mode — Desarrollo en caliente contra la CDN local

## Concepto

En vez de apuntar el CMS a un `localhost:4200` de Angular, **la CDN local ES el dev server**. El CMS sigue apuntando a `https://synergos-static-local` como siempre, y los cambios en el código fuente Angular se reflejan ahí directamente.

```
┌────────────────┐     ┌──────────────┐     ┌────────────────────────┐
│  Editor (VS Code)  │──> │  nx watch    │──> │  dist/{element}/browser/ │
│  save archivo      │     │  rebuild     │     │  main.js (+ .map)       │
└────────────────┘     └──────────────┘     └──────────┬─────────────┘
                                                        │ fs.watch
                                                        ▼
                            ┌────────────────────────────────────────┐
                            │  LOCAL_CDN/synergos/{element}/angular/  │
                            │  latest/main.js                        │
                            └──────────┬─────────────────────────────┘
                                       │ https://synergos-static-local
                                       ▼
                            ┌────────────────────────┐
                            │  Browser (CMS page)     │
                            │  refresh → ve cambios   │
                            └────────────────────────┘
```

## Uso

```bash
# Desarrollar el hero
npm run dev:cdn -- --element=hero

# Múltiples elementos
npm run dev:cdn -- --element=hero,card,footer

# Si el runtime ya está publicado
npm run dev:cdn -- --element=hero --skip-runtime
```

## Qué hace

1. **Verifica runtime** — Si `import-map.json` no existe en la CDN, lo compila y publica automáticamente.
2. **Build inicial** — Compila el/los elemento(s) con config `cdn-dev` y copia a CDN.
3. **Watch mode** — Inicia `nx watch` que detecta cambios en el source del elemento Y sus dependencias (libs/shared, libs/core, vitals/).
4. **Sync automático** — Un `fs.watch` en `dist/` detecta cuando el build termina y copia `main.js` + `main.js.map` a la CDN.

## Configuración `cdn-dev`

Definida en `platforms/angular/nx.json`. Es un híbrido de production + development:

| Propiedad | Valor | Por qué |
|---|---|---|
| `externalDependencies` | Todos los Angular + @synergos/* | Bundles livianos (~10 KB), resueltos vía import-map |
| `sourceMap` | `true` | DevTools del browser muestra el source original |
| `optimization` | `false` | Build más rápido, sin minificar |
| `outputHashing` | `"none"` | Nombre fijo `main.js` (sin hash), CDN siempre sirve la misma URL |

## Flujo de cambio

```
1. Editas hero.ts o hero.html
2. nx watch detecta el cambio (~200ms)
3. Angular rebuild con cdn-dev (~1-3s, esbuild es rápido)
4. dist/hero/browser/main.js se actualiza
5. fs.watch detecta el cambio, copia a LOCAL_CDN (~50ms)
6. Refresh en el browser → ves el cambio en el CMS real
```

**Tiempo total estimado: 2-4 segundos** desde guardar hasta ver el cambio.

## Investigación: Rutas para mejorar

### Ruta 1: LiveReload automático (próximo paso natural)

Agregar un mini servidor WebSocket al script `dev-cdn.mjs` que:
- Escuche en `ws://localhost:35729`
- Envíe `"reload"` cada vez que se sincroniza un archivo a CDN
- En el CMS, inyectar un `<script>` pequeño en dev que conecte al WebSocket y haga `location.reload()`

Esto elimina el refresh manual. Complejidad: baja. Solo requiere el módulo `ws` o un WebSocket vanilla.

### Ruta 2: Angular dev-server como proxy a CDN

Usar `nx serve hero` (Vite + HMR) y redirigir la salida a CDN:

- **Pro**: HMR real — cambios en templates/styles se aplican sin refresh completo.
- **Contra**: El dev-server de Angular NO usa `externalDependencies` en modo development — bundlea TODO Angular (~150 KB por elemento). Habría que crear un plugin Vite custom que resuelva externals al import-map.
- **Contra**: El CMS y el dev-server son hosts distintos — CORS y import-map complications.
- **Viabilidad**: Media-alta, pero requiere un Vite plugin personalizado.

### Ruta 3: esbuild watch directo (sin nx watch)

Usar la API `context.watch()` de esbuild directamente para re-bundlear el entry point del elemento:

```javascript
const ctx = await esbuild.context({
  entryPoints: ['apps/elements/modules/hero/src/main.ts'],
  bundle: true, format: 'esm',
  external: ['@angular/*', 'rxjs', '@synergos/*'],
  outfile: 'C:\\LOCAL_CDN\\synergos\\hero\\angular\\latest\\main.js',
});
await ctx.watch(); // ~50ms rebuilds
```

- **Pro**: Rebuilds de ~50ms (vs 1-3s con Angular builder). Output directo a CDN, sin copia.
- **Contra**: Bypasea el Angular compiler — no compila templates `.html` ni procesa SCSS. Solo funciona para cambios en TypeScript puro que no tocan templates.
- **Viabilidad**: Solo útil como complemento, no como reemplazo.

### Ruta 4: Windows Junctions (symlinks de directorio)

En vez de copiar archivos, crear un junction:
```
C:\LOCAL_CDN\synergos\hero\angular\latest\ → platforms\angular\dist\hero\browser\
```

- **Pro**: Zero-copy. Angular escribe, CDN lo sirve instantáneamente.
- **Contra**: Si Angular limpia `dist/` en cada build, el junction puede quebrarse temporalmente. Los sourcemaps y archivos extra (`index.html`) también quedarían visibles en CDN.
- **Viabilidad**: Alta para desarrollo local, pero frágil.

## Recomendación

**Fase actual** (implementada): `nx watch` + `fs.watch` sync — funcional, confiable, 2-4s por ciclo.

**Próximo paso**: Agregar LiveReload (Ruta 1) — elimina el refresh manual con complejidad mínima.

**Futuro**: Explorar Ruta 2 (Vite proxy) si el ciclo de 2-4s se siente lento. Es la ruta más ambiciosa pero la que da HMR real.
