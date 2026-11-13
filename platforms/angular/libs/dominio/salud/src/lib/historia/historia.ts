import { Injectable, computed, inject, signal } from '@angular/core';
import { LecturaRechazada } from '@synergos/core';
import {
  abrirLaHistoria,
  buscarLaHistoria,
  enviarElCheckIn,
  leerElResumenDelPaciente,
  leerMiResumen,
  validarElDato,
} from './historia-api.client';
import { TEXTOS_DE_SALUD, type TextosDeLaHistoria } from '../comun/textos';
import type { AperturaDeLaHistoria, CheckInDelPaciente, HistoriaEncontrada, ResumenDeLaHistoria } from './historia.model';

/**
 * En qué quedó una lectura de la historia. Cada estado es una cosa distinta que decirle a quien mira: «no tienes historia»
 * no es «no pudimos leerla», y ninguno de los dos es «no tienes alergias».
 */
export type EstadoDeLaHistoria = 'inicio' | 'cargando' | 'lista' | 'sin-historia' | 'sin-sesion' | 'negada' | 'ilegible';

/** El estado que corresponde a un rechazo del borde. */
export function estadoDelRechazo(error: unknown): EstadoDeLaHistoria {
  if (error instanceof LecturaRechazada) {
    if (error.estado === 401) return 'sin-sesion';
    if (error.estado === 403) return 'negada';
    if (error.estado === 404) return 'sin-historia';
  }
  return 'ilegible';
}

/**
 * «Mi salud» y el check-in del paciente de la sesión (I2 T062), con la receta de la tienda: la fachada lleva el estado y
 * los casos de uso; las vistas lo pintan y avisan la intención. Una por elemento.
 */
@Injectable()
export class MiHistoria {
  readonly #textos = inject(TEXTOS_DE_SALUD).historia;
  readonly estado = signal<EstadoDeLaHistoria>('inicio');
  readonly resumen = signal<ResumenDeLaHistoria | null>(null);
  readonly enviando = signal(false);
  /** Lo que quedó del último envío del check-in. */
  readonly aviso = signal('');
  /** Si hay que pedirle el permiso para que el consultorio vea su historia: sólo cuando el CMS dijo que falta. */
  readonly faltaElPermiso = computed(() => this.resumen()?.permisoDeLaHistoria === 'falta');

  async cargar(base: string): Promise<void> {
    this.estado.set('cargando');
    try {
      this.resumen.set(await leerMiResumen(base));
      this.estado.set('lista');
    } catch (error) {
      this.resumen.set(null);
      this.estado.set(estadoDelRechazo(error));
    }
  }

  /** Envía el check-in. Devuelve si quedó; si no, el aviso dice por qué. */
  async enviarCheckIn(base: string, checkIn: CheckInDelPaciente): Promise<boolean> {
    if (this.enviando()) {
      return false;
    }
    this.enviando.set(true);
    this.aviso.set('');
    try {
      const resumen = await enviarElCheckIn(base, checkIn);
      this.resumen.set({ ...resumen, permisoDeLaHistoria: this.resumen()?.permisoDeLaHistoria ?? null });
      this.estado.set('lista');
      this.aviso.set(this.#textos.checkInGuardado);
      return true;
    } catch (error) {
      this.aviso.set(avisoDelEnvio(error, this.#textos));
      return false;
    } finally {
      this.enviando.set(false);
    }
  }

  /** El permiso se dio por la puerta: ya no hay que pedirlo. */
  permisoDado(): void {
    this.resumen.update((r) => (r ? { ...r, permisoDeLaHistoria: 'vigente' } : r));
  }
}

/** En qué quedó la búsqueda de recepción. */
export type EstadoDeLaBusqueda = 'inicio' | 'buscando' | 'encontrada' | 'sin-historia' | 'sin-miembro' | 'negada' | 'ilegible';

/**
 * La historia en el consultorio (I2 T063): recepción la busca por el correo del miembro y la abre si no tiene; el médico
 * ve el resumen con el permiso del paciente y valida lo declarado. Quién puede cada cosa lo decide el servidor.
 */
@Injectable()
export class HistoriaEnElConsultorio {
  readonly #textos = inject(TEXTOS_DE_SALUD).historia;
  readonly busqueda = signal<EstadoDeLaBusqueda>('inicio');
  readonly encontrada = signal<HistoriaEncontrada | null>(null);
  readonly correo = signal('');
  readonly estadoDelResumen = signal<EstadoDeLaHistoria>('inicio');
  readonly resumen = signal<ResumenDeLaHistoria | null>(null);
  readonly moviendo = signal(false);
  readonly aviso = signal('');

  async buscar(base: string, correo: string): Promise<void> {
    const limpio = correo.trim();
    if (!limpio || this.moviendo()) {
      return;
    }
    this.#limpiar();
    this.correo.set(limpio);
    this.busqueda.set('buscando');
    this.moviendo.set(true);
    try {
      const encontrada = await buscarLaHistoria(base, limpio);
      this.encontrada.set(encontrada);
      this.busqueda.set(encontrada.patientKey ? 'encontrada' : 'sin-historia');
    } catch (error) {
      const estado = estadoDelRechazo(error);
      this.busqueda.set(estado === 'sin-historia' ? 'sin-miembro' : estado === 'negada' || estado === 'sin-sesion' ? 'negada' : 'ilegible');
    } finally {
      this.moviendo.set(false);
    }
  }

  /** Abre la historia del miembro que se buscó, sólo con lo demográfico. */
  async abrir(base: string, nombre: string, fechaDeNacimiento: string): Promise<boolean> {
    if (this.moviendo() || !this.correo()) {
      return false;
    }
    const apertura: AperturaDeLaHistoria = { correo: this.correo(), nombre: nombre.trim(), fechaDeNacimiento };
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      const patientKey = await abrirLaHistoria(base, apertura);
      this.encontrada.set({ patientKey, nombre: apertura.nombre, preRegistrado: false });
      this.busqueda.set('encontrada');
      this.aviso.set(this.#textos.aperturaLista);
      return true;
    } catch (error) {
      const estado = estadoDelRechazo(error);
      this.aviso.set(
        estado === 'negada' || estado === 'sin-sesion'
          ? this.#textos.aperturaSinRol
          : error instanceof LecturaRechazada && error.estado === 400
            ? this.#textos.aperturaRevisa
            : this.#textos.aperturaFallo,
      );
      return false;
    } finally {
      this.moviendo.set(false);
    }
  }

  /** El resumen de la historia encontrada, para el médico. Sin el permiso del paciente, `negada`. */
  async leerResumen(base: string): Promise<void> {
    const clave = this.encontrada()?.patientKey;
    if (!clave) {
      return;
    }
    this.estadoDelResumen.set('cargando');
    try {
      this.resumen.set(await leerElResumenDelPaciente(base, clave));
      this.estadoDelResumen.set('lista');
    } catch (error) {
      this.resumen.set(null);
      this.estadoDelResumen.set(estadoDelRechazo(error));
    }
  }

  async validar(base: string, datoId: string): Promise<void> {
    const clave = this.encontrada()?.patientKey;
    if (!clave || this.moviendo()) {
      return;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      this.resumen.set(await validarElDato(base, clave, datoId));
    } catch (error) {
      this.aviso.set(
        estadoDelRechazo(error) === 'negada' ? this.#textos.validarSinPermiso : this.#textos.validarFallo,
      );
    } finally {
      this.moviendo.set(false);
    }
  }

  #limpiar(): void {
    this.encontrada.set(null);
    this.resumen.set(null);
    this.estadoDelResumen.set('inicio');
    this.aviso.set('');
  }
}

function avisoDelEnvio(error: unknown, textos: TextosDeLaHistoria): string {
  if (error instanceof LecturaRechazada) {
    if (error.estado === 400) return textos.checkInRevisa;
    if (error.estado === 404) return textos.checkInSinHistoria;
    if (error.estado === 401) return textos.checkInSinSesion;
  }
  return textos.checkInFallo;
}
