import { defineConfig } from 'vitest/config';

/**
 * La configuración de los gates de `tools/lib`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXISTE POR UNA SOLA RAZÓN: EXCLUIR `.claude/`.
 *
 * `npm run test:tools` es `npx vitest run tools/lib`, y ese argumento **no es un
 * directorio: es un filtro de substring** contra los ficheros que vitest
 * descubre. Así que también casaba
 * `.claude/worktrees/agent-<id>/tools/lib/*.spec.mjs` — las copias que deja un
 * agente al trabajar en un worktree.
 *
 * Medido en el clon primario: **20 specs reales y 22 copias**, contadas como
 * 41 ficheros / 597 tests. La cifra inflada llegó a dos cierres de ticket
 * (#44 y #49) antes de que nadie la cruzara.
 *
 * Y la cifra es lo de menos. Lo grave es que **vitest estaba ejecutando código
 * duplicado y VIEJO como si fuera del proyecto**: un spec borrado del árbol
 * seguiría «pasando» desde una copia, y uno arreglado convive con su versión
 * rota dando las dos por buenas. Un verde que sale de código que no está en el
 * repo no dice nada sobre el repo.
 *
 * `.claude/*` está en `.gitignore`, pero vitest no mira el gitignore para
 * descubrir tests — sus exclusiones por defecto son `node_modules`, `dist` y
 * poco más.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.test-out/**',
      // Los worktrees de los agentes. Sin esto, cada agente que haya trabajado
      // en este clon suma su copia entera del árbol al conteo.
      '**/.claude/**',
    ],
  },
});
