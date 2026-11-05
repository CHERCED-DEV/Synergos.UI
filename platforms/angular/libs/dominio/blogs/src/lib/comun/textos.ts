import { InjectionToken } from '@angular/core';

/**
 * Lo que la red le dice a quien la usa desde los casos de uso de la fachada (012-blogs-social, I2). Los pone la app
 * —los del diccionario con `t()`, ADR 0136—: una librería no traduce ni escribe textos de interfaz, igual que
 * `TEXTOS_DE_LA_TIENDA`.
 */
export interface TextosDeBlogs {
  readonly feedNoCargo: string;
  readonly publicarNoGuardado: string;
  readonly publicarFallo: string;
  readonly articuloFallo: string;
  readonly reaccionNoGuardada: string;
  readonly seguirNoGuardado: string;
  readonly publicacionNoAbrio: string;
  readonly perfilNoCargo: string;
  readonly notificacionesNoCargaron: string;
  readonly busquedaFallo: string;
  readonly mensajesNoCargaron: string;
  readonly conversacionNoAbrio: string;
  readonly mensajeNoEnviado: string;
  readonly mensajeSigueSinEnviar: string;
  readonly guardadosNoCargaron: string;
  readonly guardarFallo: string;
  readonly quitarGuardadoFallo: string;
  readonly estudioNoCargo: string;
  readonly conversacionAjena: string;
  readonly sesionParaVer: string;
  readonly sesionParaNotificaciones: string;
  readonly sesionParaMensajes: string;
  readonly sesionParaEnviar: string;
  readonly sesionParaGuardados: string;
  readonly sesionParaGuardar: string;
  readonly sesionParaGestionarGuardados: string;
  readonly sesionParaEstudio: string;
  readonly comentarioEnRevision: string;
  readonly comentarioSinSesion: string;
  readonly comentarioNoPublicado: string;
  readonly meGustaSinSesion: string;
  readonly meGustaNoGuardado: string;
  /** El nombre de quien lee sin sesión, en lo que la pantalla pinta en local («Tú»). */
  readonly quienLee: string;
  /** La línea del plan en el resumen de la suscripción («Membresía Fan»). */
  membresia(plan: string): string;
}

export const TEXTOS_DE_BLOGS = new InjectionToken<TextosDeBlogs>('TEXTOS_DE_BLOGS');
