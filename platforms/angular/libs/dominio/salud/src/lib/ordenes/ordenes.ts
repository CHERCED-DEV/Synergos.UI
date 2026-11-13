import { Injectable, inject, signal } from '@angular/core';
import { LecturaRechazada } from '@synergos/core';
import { TEXTOS_DE_SALUD } from '../comun/textos';
import { estadoDelRechazo, type EstadoDeLaHistoria } from '../historia/historia';
import { cargarElResultado, leerLasOrdenes, leerMisOrdenes, liberarElResultado, ordenar } from './ordenes-api.client';
import type { OrdenDelPaciente, OrdenEscrita, ResultadoCargado } from './ordenes.model';

const reemplazar = (ordenes: readonly OrdenDelPaciente[], orden: OrdenDelPaciente): readonly OrdenDelPaciente[] =>
  ordenes.some((o) => o.id === orden.id) ? ordenes.map((o) => (o.id === orden.id ? orden : o)) : [orden, ...ordenes];

/**
 * Las órdenes del paciente que se atiende (003-salud-cita, I4): el médico ordena y libera; el consultorio carga el
 * resultado. Quién puede cada cosa lo decide el servidor; la fachada lleva el estado y dice qué pasó.
 */
@Injectable()
export class OrdenesDelPaciente {
  readonly #textos = inject(TEXTOS_DE_SALUD).historia;
  readonly estado = signal<EstadoDeLaHistoria>('inicio');
  readonly ordenes = signal<readonly OrdenDelPaciente[]>([]);
  readonly moviendo = signal(false);
  readonly aviso = signal('');

  async cargar(base: string, patientKey: string): Promise<void> {
    this.estado.set('cargando');
    this.aviso.set('');
    try {
      this.ordenes.set(await leerLasOrdenes(base, patientKey));
      this.estado.set('lista');
    } catch (error) {
      this.ordenes.set([]);
      this.estado.set(estadoDelRechazo(error));
    }
  }

  ordenar(base: string, patientKey: string, orden: OrdenEscrita): Promise<boolean> {
    return this.#mover(() => ordenar(base, patientKey, orden), this.#textos.ordenGuardada, this.#textos.ordenRevisa);
  }

  cargarResultado(base: string, patientKey: string, ordenId: string, resultado: ResultadoCargado): Promise<boolean> {
    return this.#mover(
      () => cargarElResultado(base, patientKey, ordenId, resultado),
      this.#textos.resultadoCargado,
      this.#textos.resultadoRevisa,
    );
  }

  liberar(base: string, patientKey: string, resultadoId: string): Promise<boolean> {
    return this.#mover(() => liberarElResultado(base, patientKey, resultadoId), this.#textos.resultadoLiberado, this.#textos.guardarFallo);
  }

  async #mover(accion: () => Promise<OrdenDelPaciente>, hecho: string, revisa: string): Promise<boolean> {
    if (this.moviendo()) {
      return false;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      const orden = await accion();
      this.ordenes.update((ordenes) => reemplazar(ordenes, orden));
      this.aviso.set(hecho);
      return true;
    } catch (error) {
      this.aviso.set(error instanceof LecturaRechazada && error.estado === 400 ? revisa : this.#textos.guardarFallo);
      return false;
    } finally {
      this.moviendo.set(false);
    }
  }
}

/** Los resultados del paciente de la sesión (I4): sólo los liberados. Una lista que no se pudo leer no es una vacía. */
@Injectable()
export class MisResultados {
  readonly estado = signal<EstadoDeLaHistoria>('inicio');
  readonly ordenes = signal<readonly OrdenDelPaciente[]>([]);

  async cargar(base: string): Promise<void> {
    this.estado.set('cargando');
    try {
      this.ordenes.set(await leerMisOrdenes(base));
      this.estado.set('lista');
    } catch (error) {
      this.ordenes.set([]);
      this.estado.set(estadoDelRechazo(error));
    }
  }
}
