import { Injectable, computed, inject, signal } from '@angular/core';
import { isBlogsForbidden, isBlogsNotFound, isBlogsUnauthorized } from '../comun/errores';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { ModeracionApi } from './moderacion-api.client';
import type { CasoDeModeracion, DecisionDeModeracion, ObjetivoDeLaDenuncia } from './moderacion.model';

/** Quién mira la cola: con permiso, sin sesión, sin un rol que modere, o la cola no cargó. */
export type AccesoALaCola = 'ok' | 'anon' | 'sin-permiso' | 'fallo';

/**
 * Denunciar y la cola de moderación (012-blogs-social, I5, P8 A): cualquiera con sesión denuncia lo que ve, y quien
 * modera decide mantener o retirar, diciendo por qué. Retirar lo saca para todos; eso lo hace el CMS.
 */
@Injectable()
export class ModeracionDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(ModeracionApi);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  /** Si el despliegue declara dónde se modera. Sin base no se ofrece denunciar: no habría a quién mandarlo. */
  readonly disponible = computed(() => this.#red.moderacionBase() !== '');

  // ─── La denuncia ────────────────────────────────────────────────────────────

  /** Lo que se está denunciando, o `null` con el panel cerrado. */
  readonly objetivo = signal<ObjetivoDeLaDenuncia | null>(null);
  readonly motivo = signal('');
  readonly enviando = signal(false);
  /** Si la denuncia llegó: el panel lo dice y sólo ofrece cerrar. */
  readonly enviada = signal(false);
  /** Lo que pasó al enviar, para el panel; vacío mientras se escribe. */
  readonly aviso = signal('');

  // ─── La cola ────────────────────────────────────────────────────────────────

  readonly casos = signal<readonly CasoDeModeracion[]>([]);
  readonly colaCargada = signal(false);
  readonly accesoALaCola = signal<AccesoALaCola>('ok');
  /** La decisión que se está por confirmar, con su motivo. */
  readonly decision = signal<{ readonly caso: CasoDeModeracion; readonly decision: DecisionDeModeracion } | null>(null);
  readonly motivoDeLaDecision = signal('');
  readonly decidiendo = signal(false);
  readonly avisoDeLaDecision = signal('');

  constructor() {
    // Sin sesión no hay cola que enseñar, ni denuncia a medias de otra persona.
    this.#red.alPerderLaSesion(() => {
      this.casos.set([]);
      this.decision.set(null);
      this.accesoALaCola.set('anon');
      this.cerrar();
    });
  }

  /** Abre el panel para denunciar `objetivo`. */
  denunciar(objetivo: ObjetivoDeLaDenuncia): void {
    this.objetivo.set(objetivo);
    this.motivo.set('');
    this.enviada.set(false);
    this.aviso.set('');
  }

  cerrar(): void {
    this.objetivo.set(null);
    this.enviada.set(false);
    this.aviso.set('');
  }

  async enviar(): Promise<void> {
    const objetivo = this.objetivo();
    const motivo = this.motivo().trim();
    if (!objetivo || !motivo || this.enviando() || this.enviada()) {
      return;
    }
    this.enviando.set(true);
    this.aviso.set('');
    try {
      await this.#api.denunciar(this.#red.moderacionBase(), objetivo, motivo);
      this.enviada.set(true);
      this.aviso.set(this.#textos.denunciaEnviada);
      this.#red.anunciar(this.#textos.denunciaEnviada);
    } catch (error) {
      // Lo que no llegó no se da por enviado: el motivo sigue en la caja para reintentar. Se dice por la región viva
      // compartida: un aviso que nace con su texto no lo lee nadie.
      const aviso = isBlogsUnauthorized(error)
        ? this.#textos.denunciaSinSesion
        : isBlogsNotFound(error)
          ? this.#textos.denunciaYaNoEsta
          : this.#textos.denunciaNoEnviada;
      this.aviso.set(aviso);
      this.#red.anunciar(aviso);
    } finally {
      this.enviando.set(false);
    }
  }

  async cargarCola(): Promise<void> {
    this.#red.loading.set(true);
    try {
      this.casos.set(await this.#api.cola(this.#red.moderacionBase()));
      this.accesoALaCola.set('ok');
    } catch (error) {
      this.casos.set([]);
      this.accesoALaCola.set(
        isBlogsUnauthorized(error) ? 'anon' : isBlogsForbidden(error) ? 'sin-permiso' : 'fallo',
      );
    } finally {
      this.colaCargada.set(true);
      this.#red.loading.set(false);
    }
  }

  /** Prepara decidir `caso`: falta el motivo, y confirmar. */
  prepararDecision(caso: CasoDeModeracion, decision: DecisionDeModeracion): void {
    this.decision.set({ caso, decision });
    this.motivoDeLaDecision.set('');
    this.avisoDeLaDecision.set('');
  }

  cancelarDecision(): void {
    this.decision.set(null);
    this.avisoDeLaDecision.set('');
  }

  async confirmarDecision(): Promise<void> {
    const pendiente = this.decision();
    const motivo = this.motivoDeLaDecision().trim();
    if (!pendiente || !motivo || this.decidiendo()) {
      return;
    }
    this.decidiendo.set(true);
    this.avisoDeLaDecision.set('');
    try {
      await this.#api.decidir(this.#red.moderacionBase(), pendiente.caso.id, pendiente.decision, motivo);
      // Sólo lo que el servidor guardó sale de la cola.
      this.casos.update((casos) => casos.filter((caso) => caso.id !== pendiente.caso.id));
      this.decision.set(null);
      this.#red.anunciar(this.#textos.decisionGuardada);
    } catch (error) {
      if (isBlogsUnauthorized(error)) {
        this.accesoALaCola.set('anon');
      } else if (isBlogsForbidden(error)) {
        this.accesoALaCola.set('sin-permiso');
      }
      this.avisoDeLaDecision.set(this.#textos.decisionNoGuardada);
      this.#red.anunciar(this.#textos.decisionNoGuardada);
    } finally {
      this.decidiendo.set(false);
    }
  }
}
