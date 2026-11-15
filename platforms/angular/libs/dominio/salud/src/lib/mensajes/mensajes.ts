import { Injectable, inject, signal } from '@angular/core';
import { LecturaRechazada } from '@synergos/core';
import { TEXTOS_DE_SALUD } from '../comun/textos';
import { estadoDelRechazo, type EstadoDeLaHistoria } from '../historia/historia';
import {
  escribirAlProfesional,
  leerElHilo,
  leerLaBandeja,
  leerMiCuenta,
  leerMisMensajes,
  responderElHilo,
} from './mensajes-api.client';
import type { CuentaDelPaciente, HiloDelConsultorio, HiloDelPaciente, ItemDeLaBandeja } from './mensajes.model';

const estadoDe = (error: unknown): number | null => (error instanceof LecturaRechazada ? error.estado : null);

/**
 * Los mensajes del paciente de la sesión con los profesionales del consultorio (003-salud-cita, I7 P15). Lo que no se pudo
 * leer no es «sin mensajes».
 */
@Injectable()
export class MisMensajes {
  readonly #textos = inject(TEXTOS_DE_SALUD).historia;
  readonly estado = signal<EstadoDeLaHistoria>('inicio');
  readonly hilos = signal<readonly HiloDelPaciente[]>([]);
  readonly enviando = signal(false);
  readonly aviso = signal('');

  async cargar(base: string): Promise<void> {
    this.estado.set('cargando');
    try {
      this.hilos.set(await leerMisMensajes(base));
      this.estado.set('lista');
    } catch (error) {
      this.hilos.set([]);
      this.estado.set(estadoDelRechazo(error));
    }
  }

  /** Escribe a un profesional; el hilo con él queda arriba. `true` si se envió. */
  async escribir(base: string, profesional: string, texto: string): Promise<boolean> {
    if (this.enviando()) {
      return false;
    }
    this.enviando.set(true);
    this.aviso.set('');
    try {
      const hilo = await escribirAlProfesional(base, profesional, texto);
      this.hilos.update((hilos) => [hilo, ...hilos.filter((h) => h.id !== hilo.id)]);
      this.estado.set('lista');
      this.aviso.set(this.#textos.mensajeEnviado);
      return true;
    } catch (error) {
      this.aviso.set(estadoDe(error) === 400 ? this.#textos.mensajeRevisa : this.#textos.guardarFallo);
      return false;
    } finally {
      this.enviando.set(false);
    }
  }
}

/**
 * La bandeja del consultorio (I7 P16): lo que espera al médico, y el hilo que abre para contestar. Lo que se atiende sale de
 * la bandeja al volver a leerla; un mensaje contestado sale en el acto.
 */
@Injectable()
export class BandejaDeLaConsulta {
  readonly #textos = inject(TEXTOS_DE_SALUD).historia;
  readonly estado = signal<EstadoDeLaHistoria>('inicio');
  readonly items = signal<readonly ItemDeLaBandeja[]>([]);
  readonly sinPermiso = signal(0);
  readonly hilo = signal<HiloDelConsultorio | null>(null);
  readonly moviendo = signal(false);
  readonly aviso = signal('');

  async cargar(base: string): Promise<void> {
    this.estado.set('cargando');
    try {
      const bandeja = await leerLaBandeja(base);
      this.items.set(bandeja.items);
      this.sinPermiso.set(bandeja.sinPermiso);
      this.estado.set('lista');
    } catch (error) {
      this.items.set([]);
      this.sinPermiso.set(0);
      this.estado.set(estadoDelRechazo(error));
    }
  }

  async abrirHilo(base: string, hiloId: string): Promise<void> {
    this.aviso.set('');
    try {
      this.hilo.set(await leerElHilo(base, hiloId));
    } catch (error) {
      this.hilo.set(null);
      this.aviso.set(estadoDe(error) === 403 ? this.#textos.validarSinPermiso : this.#textos.guardarFallo);
    }
  }

  cerrarHilo(): void {
    this.hilo.set(null);
  }

  /** Contesta el hilo abierto; contestado, sale de la bandeja. */
  async responder(base: string, texto: string): Promise<boolean> {
    const abierto = this.hilo();
    if (!abierto || this.moviendo()) {
      return false;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      const hilo = await responderElHilo(base, abierto.id, texto);
      this.hilo.set(hilo);
      this.items.update((items) => items.filter((i) => !(i.tipo === 'mensaje' && i.id === hilo.id)));
      this.aviso.set(this.#textos.respuestaEnviada);
      return true;
    } catch (error) {
      const estado = estadoDe(error);
      this.aviso.set(estado === 400 ? this.#textos.mensajeRevisa : estado === 403 ? this.#textos.validarSinPermiso : this.#textos.guardarFallo);
      return false;
    } finally {
      this.moviendo.set(false);
    }
  }
}

/** El estado de cuenta del paciente de la sesión (I7 P17), con las cifras de Payments. Una cuenta que no se leyó no es «sin cobros». */
@Injectable()
export class MiCuenta {
  readonly estado = signal<EstadoDeLaHistoria>('inicio');
  readonly cuenta = signal<CuentaDelPaciente>({ lineas: [], totales: [] });

  async cargar(base: string): Promise<void> {
    this.estado.set('cargando');
    try {
      this.cuenta.set(await leerMiCuenta(base));
      this.estado.set('lista');
    } catch (error) {
      this.cuenta.set({ lineas: [], totales: [] });
      this.estado.set(estadoDelRechazo(error));
    }
  }
}
