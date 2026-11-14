import { Injectable, computed, inject, signal } from '@angular/core';
import { LecturaRechazada } from '@synergos/core';
import { TEXTOS_DE_SALUD } from '../comun/textos';
import { estadoDelRechazo, type EstadoDeLaHistoria } from '../historia/historia';
import {
  anularLaReceta,
  emitirLaReceta,
  leerLasRecetas,
  leerLasRenovaciones,
  leerMisRecetas,
  leerMisRenovaciones,
  pedirLaRenovacion,
  resolverLaRenovacion,
} from './recetas-api.client';
import type { RecetaDelPaciente, RecetaEscrita, RenovacionDeReceta } from './recetas.model';

const estadoDe = (error: unknown): number | null => (error instanceof LecturaRechazada ? error.estado : null);

/**
 * Las recetas del paciente que se atiende (003-salud-cita, I5): el médico emite la receta firmada, la anula y resuelve
 * las renovaciones pedidas. Quién puede cada cosa lo decide el servidor.
 */
@Injectable()
export class RecetasDelPaciente {
  readonly #textos = inject(TEXTOS_DE_SALUD).historia;
  readonly estado = signal<EstadoDeLaHistoria>('inicio');
  readonly recetas = signal<readonly RecetaDelPaciente[]>([]);
  readonly renovaciones = signal<readonly RenovacionDeReceta[]>([]);
  readonly pendientes = computed(() => this.renovaciones().filter((r) => r.estado === 'pedida'));
  readonly moviendo = signal(false);
  readonly aviso = signal('');

  async cargar(base: string, patientKey: string): Promise<void> {
    this.estado.set('cargando');
    this.aviso.set('');
    try {
      const [recetas, renovaciones] = await Promise.all([leerLasRecetas(base, patientKey), leerLasRenovaciones(base, patientKey)]);
      this.recetas.set(recetas);
      this.renovaciones.set(renovaciones);
      this.estado.set('lista');
    } catch (error) {
      this.recetas.set([]);
      this.renovaciones.set([]);
      this.estado.set(estadoDelRechazo(error));
    }
  }

  async emitir(base: string, patientKey: string, escrita: RecetaEscrita): Promise<boolean> {
    return this.#mover(async () => {
      const receta = await emitirLaReceta(base, patientKey, escrita);
      this.recetas.update((recetas) => [receta, ...recetas]);
    }, this.#textos.recetaEmitida, this.#textos.recetaRevisa);
  }

  async anular(base: string, patientKey: string, id: string): Promise<boolean> {
    return this.#mover(async () => {
      const receta = await anularLaReceta(base, patientKey, id);
      this.recetas.update((recetas) => recetas.map((r) => (r.id === receta.id ? receta : r)));
    }, this.#textos.recetaAnulada, this.#textos.guardarFallo);
  }

  /** Aprobada, sale una receta nueva: se vuelven a leer las dos listas. */
  async resolver(base: string, patientKey: string, id: string, aprobar: boolean, motivo?: string): Promise<boolean> {
    const hecho = await this.#mover(
      async () => {
        const r = await resolverLaRenovacion(base, patientKey, id, aprobar, motivo);
        this.renovaciones.update((lista) => lista.map((x) => (x.id === r.id ? r : x)));
      },
      aprobar ? this.#textos.renovacionAprobada : this.#textos.renovacionRechazada,
      this.#textos.guardarFallo,
    );
    if (hecho && aprobar) {
      this.recetas.set(await leerLasRecetas(base, patientKey).catch(() => this.recetas()));
    }
    return hecho;
  }

  async #mover(accion: () => Promise<void>, hecho: string, revisa: string): Promise<boolean> {
    if (this.moviendo()) {
      return false;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      await accion();
      this.aviso.set(hecho);
      return true;
    } catch (error) {
      const estado = estadoDe(error);
      this.aviso.set(estado === 400 ? revisa : estado === 409 ? this.#textos.notaSinLlave : this.#textos.guardarFallo);
      return false;
    } finally {
      this.moviendo.set(false);
    }
  }
}

/**
 * La medicación del paciente de la sesión (I5 P14): las recetas vigentes, las anteriores y las renovaciones que pidió.
 * Una lista que no se pudo leer no es «sin medicamentos».
 */
@Injectable()
export class MiMedicacion {
  readonly #textos = inject(TEXTOS_DE_SALUD).historia;
  readonly estado = signal<EstadoDeLaHistoria>('inicio');
  readonly recetas = signal<readonly RecetaDelPaciente[]>([]);
  readonly renovaciones = signal<readonly RenovacionDeReceta[]>([]);
  readonly vigentes = computed(() => this.recetas().filter((r) => r.vigente));
  readonly anteriores = computed(() => this.recetas().filter((r) => !r.vigente));
  readonly moviendo = signal(false);
  readonly aviso = signal('');

  async cargar(base: string): Promise<void> {
    this.estado.set('cargando');
    try {
      const [recetas, renovaciones] = await Promise.all([leerMisRecetas(base), leerMisRenovaciones(base)]);
      this.recetas.set(recetas);
      this.renovaciones.set(renovaciones);
      this.estado.set('lista');
    } catch (error) {
      this.recetas.set([]);
      this.renovaciones.set([]);
      this.estado.set(estadoDelRechazo(error));
    }
  }

  /** La última renovación que se pidió de una receta, si la hay. */
  renovacionDe(recetaId: string): RenovacionDeReceta | null {
    return this.renovaciones().find((r) => r.recetaId === recetaId) ?? null;
  }

  async pedir(base: string, recetaId: string): Promise<boolean> {
    if (this.moviendo()) {
      return false;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      const r = await pedirLaRenovacion(base, recetaId);
      this.renovaciones.update((lista) => [r, ...lista.filter((x) => x.id !== r.id)]);
      this.aviso.set(this.#textos.renovacionPedida);
      return true;
    } catch (error) {
      this.aviso.set(estadoDe(error) === 409 ? this.#textos.renovacionImposible : this.#textos.guardarFallo);
      return false;
    } finally {
      this.moviendo.set(false);
    }
  }
}
