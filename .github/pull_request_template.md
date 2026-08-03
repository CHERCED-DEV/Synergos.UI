Cierra #

## Qué cambia y por qué

<!-- El PORQUÉ. El QUÉ ya se lee en el diff. -->

## Definición de hecho

<!-- Marcá solo lo que de verdad corriste. Un check falso es peor que uno vacío. -->

- [ ] `nx build` del proyecto tocado, sin errores
- [ ] Si toqué `libs/shared` o el runtime: **`build:runtime` + `publish:runtime`** — un cambio
      compartido no se ve hasta republicar
- [ ] Si cambia el contrato con el CMS: `npm run cms:validate` en verde (la UI es la fuente de
      verdad — ADR 0083)
- [ ] **Verificado en navegador**, no solo build verde: `customElements.get('synergos-X')` en
      cierto y data real a la vista, sin `undefined`/`NaN`/`[object`
- [ ] **Los 7 temas por siteRoot** revisados si toqué estilos
- [ ] Sin overflow horizontal a 375px
- [ ] Si aprendí una regla nueva: escrita en `CLAUDE.md` **en este mismo commit**

## Qué mutación pone esto en rojo

<!-- El cambio de una línea que reintroduce el defecto. Si no se puede escribir,
     el cambio no está entendido. -->

## Lo que encontré y NO arreglé acá

<!-- Enlaces a los tickets de tipo Hallazgo que abrí. Un hallazgo no puede comerse la tarea. -->
