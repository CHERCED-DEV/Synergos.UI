// ─── Los enlaces de aviso de los flujos (núcleo N3, FR-032) ───
// GENERADO por tools/contrato-http.mjs desde Synergos.CMS.Web/appsettings.json del CMS
// (Synergos:Puerta:Flujos:{flujo}:Aviso:Ruta). NO se edita a mano.
// Con qué parámetro de la consulta llega a la página el enlace del correo, y qué marcador lo llena.

import type { AvisoDelFlujo } from '../avisos';
import type { Flujo } from '../puerta';

export const AVISOS_GENERADOS = {
  "alquiler.renta": { parametro: "alquiler", marcador: "id" },
  "educacion.matricula": { parametro: "matricula", marcador: "id" },
  "eventos.compra": { parametro: "compra", marcador: "id" },
  "gobierno.radicacion": { parametro: "radicacion", marcador: "id" },
  "propiedades.visita": { parametro: "visita", marcador: "id" },
  "reservas.servicio": { parametro: "reserva", marcador: "id" },
  "salud.cita": { parametro: "cita", marcador: "id" },
  "tienda.compra": { parametro: "compra", marcador: "id" },
  "viajes.reserva": { parametro: "viaje", marcador: "id" },
} as const satisfies Readonly<Partial<Record<Flujo, AvisoDelFlujo>>>;
