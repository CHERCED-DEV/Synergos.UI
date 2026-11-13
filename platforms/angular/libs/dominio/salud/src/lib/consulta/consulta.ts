import { Injectable, inject, signal } from '@angular/core';
import { LecturaRechazada } from '@synergos/core';
import { TEXTOS_DE_SALUD } from '../comun/textos';
import { estadoDelRechazo, type EstadoDeLaHistoria } from '../historia/historia';
import {
  comprobarLaNota,
  escribirLaNota,
  firmarLaNota,
  leerLaAgenda,
  leerLasNotas,
  marcarLaLlegada,
} from './consulta-api.client';
import type { CitaDelDia, NotaDeLaConsulta, NotaEscrita, PasoDeLlegada } from './consulta.model';

const estadoDe = (error: unknown): number | null => (error instanceof LecturaRechazada ? error.estado : null);

/**
 * La consulta del día (003-salud-cita, I3): la agenda de un profesional con la llegada de cada cita (P9, P10) y las notas
 * del paciente que se atiende (P6). Quién puede cada cosa lo decide el servidor; la fachada lleva el estado y dice qué
 * pasó con los textos que provee la app.
 */
@Injectable()
export class ConsultaDelDia {
  readonly #textos = inject(TEXTOS_DE_SALUD).historia;

  readonly estadoDeLaAgenda = signal<EstadoDeLaHistoria>('inicio');
  readonly citas = signal<readonly CitaDelDia[]>([]);
  readonly estadoDeLasNotas = signal<EstadoDeLaHistoria>('inicio');
  readonly notas = signal<readonly NotaDeLaConsulta[]>([]);
  /** De quién son las notas que se ven, y de qué cita salen. */
  readonly paciente = signal<{ readonly patientKey: string; readonly nombre: string; readonly reservaId: string | null } | null>(null);
  /** Las firmas comprobadas, por nota: `true` vale, `false` no cuadra con lo que dice hoy la nota. */
  readonly comprobadas = signal<Readonly<Record<string, boolean>>>({});
  readonly moviendo = signal(false);
  readonly aviso = signal('');

  async cargarAgenda(base: string, profesional: string, dia: string): Promise<void> {
    if (!profesional || !dia) {
      return;
    }
    this.estadoDeLaAgenda.set('cargando');
    try {
      this.citas.set(await leerLaAgenda(base, profesional, dia));
      this.estadoDeLaAgenda.set('lista');
    } catch (error) {
      this.citas.set([]);
      this.estadoDeLaAgenda.set(estadoDelRechazo(error));
    }
  }

  async marcar(base: string, reservaId: string, paso: PasoDeLlegada): Promise<void> {
    if (this.moviendo()) {
      return;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      const llegada = await marcarLaLlegada(base, reservaId, paso);
      this.citas.update((citas) => citas.map((c) => (c.reservaId === reservaId ? { ...c, llegada } : c)));
    } catch (error) {
      this.aviso.set(estadoDe(error) === 409 ? this.#textos.llegadaNoSigue : this.#textos.llegadaFallo);
    } finally {
      this.moviendo.set(false);
    }
  }

  /** Abre las notas del paciente de una cita. */
  async abrirNotas(base: string, patientKey: string, nombre: string, reservaId: string | null): Promise<void> {
    this.paciente.set({ patientKey, nombre, reservaId });
    this.comprobadas.set({});
    this.aviso.set('');
    this.estadoDeLasNotas.set('cargando');
    try {
      this.notas.set(await leerLasNotas(base, patientKey));
      this.estadoDeLasNotas.set('lista');
    } catch (error) {
      this.notas.set([]);
      this.estadoDeLasNotas.set(estadoDelRechazo(error));
    }
  }

  /** Guarda la nota como borrador. Devuelve la guardada, o `null` si no se pudo (el aviso dice por qué). */
  async guardar(base: string, escrita: NotaEscrita): Promise<NotaDeLaConsulta | null> {
    const paciente = this.paciente();
    if (!paciente || this.moviendo()) {
      return null;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      const nota = await escribirLaNota(base, paciente.patientKey, { ...escrita, reservaId: paciente.reservaId ?? undefined });
      this.notas.update((notas) => [nota, ...notas.filter((n) => n.id !== nota.id)]);
      this.aviso.set(this.#textos.notaGuardada);
      return nota;
    } catch (error) {
      const estado = estadoDe(error);
      this.aviso.set(
        estado === 409 ? this.#textos.notaYaFirmada : estado === 400 ? this.#textos.notaRevisa : this.#textos.notaFallo,
      );
      return null;
    } finally {
      this.moviendo.set(false);
    }
  }

  async firmar(base: string, id: string): Promise<boolean> {
    const paciente = this.paciente();
    if (!paciente || this.moviendo()) {
      return false;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    try {
      const nota = await firmarLaNota(base, paciente.patientKey, id);
      this.notas.update((notas) => notas.map((n) => (n.id === nota.id ? nota : n)));
      this.aviso.set(this.#textos.notaFirmada);
      return true;
    } catch (error) {
      this.aviso.set(estadoDe(error) === 409 ? this.#textos.notaSinLlave : this.#textos.notaFallo);
      return false;
    } finally {
      this.moviendo.set(false);
    }
  }

  async comprobar(base: string, id: string): Promise<void> {
    const paciente = this.paciente();
    if (!paciente) {
      return;
    }
    try {
      const vale = await comprobarLaNota(base, paciente.patientKey, id);
      this.comprobadas.update((c) => ({ ...c, [id]: vale }));
    } catch {
      this.aviso.set(this.#textos.notaFallo);
    }
  }
}
