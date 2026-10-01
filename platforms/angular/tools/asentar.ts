/**
 * Dejar que el bucle de eventos dé N vueltas: el `flushMicrotasks` que los specs de las
 * verticales escribían cada uno a mano, en UN sitio (#84).
 *
 * Cada vuelta espera un `setTimeout(0)` DE VERDAD y después drena las microtareas — la
 * misma semántica de la copia de cada spec: la detección de cambios sin zonas se agenda con
 * `setTimeout`, y un temporizador agendado antes que el de la vuelta corre antes (FIFO).
 * Lo único que cambia es CUÁNTO cuesta esperar ese temporizador.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL TIEMPO ERA EL RELOJ, Y SÓLO EN WINDOWS.
 *
 * El #84 decía que el `academy.spec` vivía pegado al tope de 5 s «por montar la vertical
 * entera en jsdom», y que no eran esperas con reloj. Medido (2026-10-01): **el 88 %** del
 * tiempo del fichero —21,1 s de 24,0— se iba DENTRO de `flushMicrotasks`, y el ciclo de
 * matrícula daba 186 vueltas para 2,8 s de espera. Cada vuelta costaba **~15 ms**: en
 * Windows, un `setTimeout(0)` no vuelve hasta el siguiente tick del temporizador del
 * sistema (15,6 ms) porque el bucle se DUERME esperándolo; en Linux, ~1 ms. Medido en
 * la misma máquina: 14–17 ms por `setTimeout(0)` contra 0,07 ms por `setImmediate`.
 *
 * Por eso la CI —Linux— no lo veía, y por eso la carga lo empujaba al tope: con la CPU
 * al 100 % cada tick llega tarde, y 186 ticks tarde son 5 s.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SALIDA NO ES `setImmediate` EN VEZ DE `setTimeout`.
 *
 * Probado: con vueltas de `setImmediate` el fichero baja a la mitad y **dos tests se ponen
 * rojos**, porque la detección de cambios que Angular agendó con `setTimeout` ya no corre
 * dentro de la espera. Lo que se hace es esperar el MISMO `setTimeout(0)` sin dejar que el
 * bucle se duerma: mientras no llega, una cadena de `setImmediate` vacíos mantiene el bucle
 * girando, libuv no se bloquea en el sistema y el temporizador sale a su milisegundo.
 * ~1 ms por vuelta, como en Linux, y el orden de los temporizadores intacto.
 */
export async function asentar(vueltas: number): Promise<void> {
  for (let i = 0; i < vueltas; i += 1) {
    await unaVuelta();
    await Promise.resolve();
  }
}

/**
 * `setImmediate` es de Node y los specs compilan sólo con los tipos de `vitest/globals`, sin
 * `@types/node`: se lee de `globalThis`. Donde no exista, la vuelta espera el `setTimeout`
 * a secas — más lenta en Windows, igual de correcta.
 */
const enLaSiguienteFase = (globalThis as { setImmediate?: (fn: () => void) => unknown }).setImmediate;

/** Un `setTimeout(0)` de verdad, sin que el bucle se duerma hasta el tick del sistema. */
export function unaVuelta(): Promise<void> {
  return new Promise<void>((resolve) => {
    let llego = false;
    setTimeout(() => {
      llego = true;
      resolve();
    }, 0);
    if (!enLaSiguienteFase) return;
    const girar = (): void => {
      if (!llego) enLaSiguienteFase(girar);
    };
    enLaSiguienteFase(girar);
  });
}
