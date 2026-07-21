/**
 * Suscripción a un canal EN VIVO del CMS (T7, ADR 0111) sobre `EventSource`.
 *
 * Es una envoltura mínima a propósito: `EventSource` ya trae **reconexión automática**,
 * que es la razón por la que el proyecto eligió SSE en vez de meter un cliente de
 * SignalR en cada bundle. Lo único que hace falta encima es tipar el mensaje, tolerar un
 * payload corrupto y **poder cerrar** — un stream que nadie cierra es una conexión
 * abierta por cada vez que el usuario entra a la consola.
 *
 * Vive en el módulo `eventos` porque hoy tiene UN consumidor. Cuando aparezca el
 * segundo (feed de Blogs, DMs), se promueve a `libs/shared` — que es externalizado y
 * obliga a republicar el runtime, así que no se paga ese coste por un solo caso.
 */
export interface RealtimeSubscription {
  /** Cierra la conexión. Idempotente: llamarlo dos veces no rompe. */
  close(): void;
}

export interface RealtimeHandlers {
  /** Un evento del canal, ya parseado. */
  readonly onEvent: (eventName: string, payload: Record<string, unknown>) => void;
  /** El servidor confirmó que el canal está abierto (evento `ready`). */
  readonly onOpen?: () => void;
  /**
   * La conexión se cayó. NO hay que reconectar a mano: `EventSource` reintenta solo.
   * Sirve para avisar en pantalla ("reconectando…"), no para orquestar reintentos.
   */
  readonly onError?: () => void;
}

/** Nombres de evento que el canal de check-in emite (contrato con el backend). */
const CHECKIN_EVENT = 'checkin';
const READY_EVENT = 'ready';

/**
 * Abre `GET {apiBase}/realtime/stream?channel=…`.
 *
 * La cookie de sesión viaja sola (same-origin) — es lo que hace que el servidor pueda
 * autorizar el canal. No se fuerza `withCredentials`: mandaría la cookie a orígenes
 * ajenos si el apiBase fuera absoluto.
 */
export function subscribeToChannel(
  streamUrl: string,
  channel: string,
  handlers: RealtimeHandlers,
): RealtimeSubscription {
  // Sin EventSource (SSR, jsdom sin polyfill) se devuelve una suscripción inerte en vez
  // de reventar: la consola sigue funcionando, solo que sin actualizaciones en vivo.
  if (typeof EventSource === 'undefined') {
    return { close: () => undefined };
  }

  const url = `${streamUrl}?channel=${encodeURIComponent(channel)}`;
  const source = new EventSource(url);
  let closed = false;

  const parse = (raw: string): Record<string, unknown> => {
    try {
      const value: unknown = JSON.parse(raw);
      return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
    } catch {
      // Un payload corrupto no puede tumbar el stream: se ignora ese mensaje.
      return {};
    }
  };

  source.addEventListener(READY_EVENT, () => handlers.onOpen?.());
  source.addEventListener(CHECKIN_EVENT, (event) => {
    handlers.onEvent(CHECKIN_EVENT, parse((event as MessageEvent<string>).data));
  });
  source.addEventListener('error', () => {
    // `EventSource` reintenta solo; esto es solo para reflejarlo en la UI.
    if (!closed) {
      handlers.onError?.();
    }
  });

  return {
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      source.close();
    },
  };
}
