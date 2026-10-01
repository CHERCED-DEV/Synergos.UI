/**
 * Lo que `<synergos-data-grid>` LEE — su API pública, la misma que declara
 * `element-inputs.json` (UI#91).
 *
 * Lo generó `tools/cms-sync.mjs` desde el schema del CMS (`dataSource`, `columnsJson`,
 * `pageSize`, `integration`) y el componente no leía ninguna de esas cuatro: el contrato
 * describía lo que el editor EDITA, no lo que el elemento recibe, y el audit lo daba por
 * bueno porque cruzaba dos copias del mismo schema. `cms-sync` no reescribe un modelo que ya
 * existe, así que este fichero se mantiene a mano.
 *
 * La otra mitad NO es de este árbol: la vista `SynHost/DataGrid.cshtml` del CMS sigue
 * emitiendo esas tres claves en el `config`, y el componente no las lee — el defecto D1
 * (regla 43). Lo cierra el record tipado de la ADR 0135 (CMS#180).
 */
export interface DataGridInputs {
  config?: string;
  title?: string;
  emptyLabel?: string;
  ctaLabel?: string;
  loading?: string;
  columns?: string;
  rows?: string;
  filters?: string;
  sort?: string;
}
