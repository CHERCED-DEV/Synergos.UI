Cierra #

## Qué cambia y por qué

<!-- El PORQUÉ. El QUÉ ya se lee en el diff. -->

## Definición de hecho

<!-- Marcá solo lo que de verdad corriste. Un check falso es peor que uno vacío. -->

- [ ] `npm run build:angular` en verde (26s)
- [ ] **`npm test` en verde** — los gates de `tools/lib` **y** los specs de la plataforma. No
      estaba en esta lista y la suite lleva viva desde el issue #1; una definición de hecho que
      no nombra la suite es cómo se aprende que correrla es opcional
- [ ] Si toqué `libs/shared` o el runtime: **`build:runtime` + `publish:runtime`** — un cambio
      compartido no se ve hasta republicar
- [ ] Si cambia el contrato con el CMS: **`npm run contracts:validate`** en verde — los cinco
      pasos, no sólo `cms:validate` (la UI es la fuente de verdad — ADR 0083). Sin los repos
      como hermanos, con `SYNERGOS_CMS_PATH=/ruta/al/CMS`
- [ ] Si toqué lo que se publica: `npm run size:check` — corre solo dentro de `build:cdn`, pero
      si sólo construiste elementos no ha corrido nadie
- [ ] **Verificado en navegador**, no solo build verde: `customElements.get('synergos-X')` en
      cierto y data real a la vista, sin `undefined`/`NaN`/`[object`
- [ ] **Los 7 temas por siteRoot** revisados si toqué estilos
- [ ] Sin overflow horizontal a 375px
- [ ] **Vi el gate en ROJO antes de darlo por bueno** — un gate que nadie vio fallar no está
      vigilando nada, y una mutación que no cambia el resultado no prueba nada aunque el gate
      esté bien (reglas 6 y 7)
- [ ] Si aprendí una regla nueva: escrita en `CLAUDE.md` **en este mismo commit**

## Qué mutación pone esto en rojo

<!-- El cambio de una línea que reintroduce el defecto. Si no se puede escribir,
     el cambio no está entendido. -->

## Lo que encontré y NO arreglé acá

<!-- Enlaces a los tickets de tipo Hallazgo que abrí. Un hallazgo no puede comerse la tarea. -->
