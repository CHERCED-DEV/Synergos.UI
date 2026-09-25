# Desplegar el CDN — lo que hace una persona a mano, una sola vez

> Issue [#75](../../../issues/75). Todo lo de acá se hace **una vez**; después cada `git push` a
> `master` construye, publica y comprueba solo.
>
> **Lo que un agente NO puede hacer y por eso está escrito acá:** crear el token. Sale de la
> cuenta de Cloudflare, y quien lo pega es su dueño. El resto lo hace el pipeline.

---

## 0. Dónde está la verdad hoy, antes de tocar nada

Esto no es una guía para montar algo nuevo: el CDN **ya existe y está sano**. Lo que falta es
que lo que hay arriba sea lo que dice este repo.

```bash
# qué commit está sirviendo el CDN ahora mismo
curl -s https://synergos-ui.synergos-labs.workers.dev/synergos/academy/angular/latest/meta.json
```

Comparalo con `git log --oneline -1 origin/master`. Si no coinciden, lo publicado no es
reproducible desde el repo — que es exactamente el estado del 2026-09-25: el CDN servía
`b951c77`, un commit que **no está en ninguna rama**, porque lo último que se publicó salió de un
`wrangler deploy` desde una máquina. Desde ese build `master` había avanzado **once veces** (78
commits contando lo que entró por el merge del 17) sin que el CDN se moviera.

> **`wrangler.jsonc` afirma que el repo y lo publicado «no pueden divergir»**, y esa frase sólo es
> verdad si publica el pipeline. Mientras publique una persona a mano, el CDN puede quedarse
> atrás **sin que nada se ponga rojo** — el humo pasa igual, porque el CDN viejo está perfecto.

---

## 1. El token de Cloudflare

**dash.cloudflare.com → el icono de perfil → API Tokens → Create Token.**

| | |
|---|---|
| plantilla | **Edit Cloudflare Workers** |
| qué permite | publicar el Worker y sus assets en la cuenta que elijas |
| qué NO hace falta | nada de zonas ni de DNS — servimos en un subdominio `workers.dev`, no en un dominio propio |

Al crearlo, en *Account Resources* elegí **la cuenta donde vive el Worker `synergos-ui`** y no
«todas»: un token que puede publicar en cualquier cuenta es un token que no hace falta.

> **Se copia una vez y no se vuelve a ver.** Si se pierde, se genera otro y se borra el viejo —
> no hay forma de releerlo.

---

## 2. El Account ID

**dash.cloudflare.com → Workers & Pages → Account Details**, y ahí está con su botón de copiar.
(También sale desde *Account home* con `Ctrl/Cmd + K` → «Copy account ID».)

No es secreto —identifica una cuenta, no abre nada sin el token— pero va como Secret igual, por
lo de abajo.

---

## 3. Dónde se pegan

En **este** repo (`Synergos.UI`), no en el del CMS:

**Settings → Secrets and variables → Actions → New repository secret.** Ojo con la pestaña: hay
dos, *Secrets* y *Variables*, y acá van las dos en Secrets.

| Nombre | Qué es |
|---|---|
| `CLOUDFLARE_API_TOKEN` | el del §1 |
| `CLOUDFLARE_ACCOUNT_ID` | el del §2 |

Los nombres son exactos: son los que lee `wrangler` del entorno, y los que `despliegue-cdn.yml`
le pasa. Cambiarlos rompe el despliegue en silencio, porque el paso 0 los mira por nombre.

> **Ninguno de los dos va al repo. Nunca.** Y si alguno se pega por error en un commit, en un
> issue o en un chat: **se rota**, no se borra el mensaje. Un secreto que se vio una vez está
> quemado.

---

## 4. Desconectar Workers Builds

Si la integración de Cloudflare con GitHub sigue enganchada al repo, **desconectala**:
*dash.cloudflare.com → Workers & Pages → `synergos-ui` → Settings → **Builds** → Disconnect*.

No rompe nada tenerla: rompe **saber**. Dos publicadores sobre el mismo Worker construyen el
mismo commit y el último gana, así que cuando algo salga mal no hay forma de decir cuál subió lo
que está arriba. Este workflow lleva la puerta (contratos + presupuesto de tamaño) y el humo; el
otro no lleva ninguno de los dos.

---

## 5. Comprobar que quedó

Empujá cualquier cosa a `master` — o lanzá **Actions → Despliegue del CDN → Run workflow**.

El job tiene que **dejar de saltarse**. Antes de las credenciales se ve así, y en verde:

```
success  ¿Está configurado el destino?
skipped  Checkout UI (este repo)
skipped  …
skipped  Humo contra la URL pública
```

Con ellas corre entero y el último paso es el que importa: espera a que el CDN sirva **ese**
commit y le pasa las siete comprobaciones —política de caché, CORS, 404, runtime por framework—.
Si el humo falla, el despliegue sale **rojo**: subir los ficheros no es que el CDN funcione.

Y después, la comprobación de una línea:

```bash
curl -s https://synergos-ui.synergos-labs.workers.dev/synergos/academy/angular/latest/meta.json
# commit tiene que ser el de origin/master
```

---

## 6. Qué está verificado y qué no

Para no repetir trabajo, y para no insinuar que está probado lo que no:

| | |
|---|---|
| ✅ `npm run build:cdn` de punta a punta | 131 bundles, dos frameworks, presupuesto dentro |
| ✅ `npx wrangler deploy --dry-run` | 1888 ficheros leídos de `public/`, binding `env.ASSETS` resuelto, exit 0 — la configuración es correcta |
| ✅ el humo contra la URL pública | pasa sus siete comprobaciones; el CDN está sano, sólo viejo |
| ✅ que el job se salte sin credenciales | corrida 4 de «Despliegue del CDN»: paso 0 verde, ocho pasos `skipped` |
| ❌ `wrangler deploy` de verdad | **nunca se ha ejecutado desde CI** — es lo único que las credenciales destraban, y lo único que este documento no puede probar por su cuenta |

---

## Lo que NO hay que montar

- **No hace falta dominio propio.** El Worker sirve en `synergos-ui.synergos-labs.workers.dev`, y
  el CMS lo consume por `Synergos__BundleRegistry__PublicBaseUrl`.
- **No hace falta tocar `public/`.** No está versionado a propósito: sale de las fuentes en cada
  despliegue, y eso es lo único que impide que el repo y lo publicado divergan.
- **No hace falta configurar caché en Cloudflare.** La política es código con tests
  (`tools/lib/cdn-cache-policy.mjs`) y la aplica `worker/index.js`, porque un `_headers` **fusiona**
  las reglas que se solapan y las tres rutas hermanas de cada elemento habrían producido
  `Cache-Control: max-age=60, max-age=31536000, immutable`.

---

## Ver también

- `.github/workflows/despliegue-cdn.yml` — el despliegue, con la razón de cada paso en su cabecera.
- `SynergosDocs/SCRIPTS.md` §PUBLISH — qué hace cada script del encadenado.
- `CLAUDE.md`, regla 33 — por qué el humo cuelga del despliegue y no del push, y qué pasó cuando no.
- `Synergos.CMS/docs/despliegue/00-montar-el-entorno.md` — el gemelo, para el otro árbol.
