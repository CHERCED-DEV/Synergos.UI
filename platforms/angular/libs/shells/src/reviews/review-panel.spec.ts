import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ReviewPanelComponent,
  type ReviewBlockedReason,
  type ReviewCriterionPrompt,
  type ReviewDraft,
  type ReviewEntry,
  type ReviewPanelConfig,
  type ReviewSummary,
} from './review-panel';

/**
 * SH-13 (#28).
 *
 * Los dos casos que justifican la pieza son **la distribución** —que no existía
 * en ningún dominio: 4,2 con todo en 4 y 4,2 mitad 5 mitad 3 son dos productos
 * distintos— y **los criterios por dominio**, que es su eje de especificidad.
 * Y el que la hace honesta: la pieza NO limpia el formulario al enviar, porque
 * sólo el dominio sabe si el servidor aceptó (#26).
 */

const RESUMEN: ReviewSummary = {
  average: 4.2,
  count: 128,
  distribution: [
    { stars: 5, count: 64 },
    { stars: 4, count: 40 },
    { stars: 3, count: 16 },
    { stars: 2, count: 5 },
    { stars: 1, count: 3 },
  ],
  criteria: [
    { id: 'limpieza', label: 'Limpieza', score: 4.6 },
    { id: 'ubicacion', label: 'Ubicación', score: 3.9 },
  ],
};

const ENTRADAS: readonly ReviewEntry[] = [
  {
    id: 'r1',
    author: 'Camila R.',
    rating: 5,
    title: 'Impecable',
    body: 'La ubicación es inmejorable y el desayuno vale la pena.',
    date: '12 de agosto de 2026',
    verified: true,
  },
  {
    id: 'r2',
    author: 'Andrés P.',
    rating: 3,
    body: 'Bien, pero el aire acondicionado hacía ruido.',
    date: '3 de agosto de 2026',
    reply: 'Gracias por contarlo — ya cambiamos el equipo de esa habitación.',
  },
];

@Component({
  standalone: true,
  imports: [ReviewPanelComponent],
  template: `
    <syn-review-panel
      [config]="config()"
      [summary]="summary()"
      [entries]="entries()"
      [canReview]="canReview()"
      [blockedReason]="blockedReason()"
      [criteriaPrompts]="prompts()"
      [notice]="notice()"
      [noticeIsError]="noticeIsError()"
      [sending]="sending()"
      [canReport]="canReport()"
      [reportedIds]="reportedIds()"
      [reportingId]="reportingId()"
      (submitreview)="log.push($event)"
      (reportreview)="reportLog.push($event)"
    />
  `,
})
class Host {
  readonly panel = viewChild.required(ReviewPanelComponent);
  readonly config = signal<ReviewPanelConfig>({});
  readonly summary = signal<ReviewSummary>(RESUMEN);
  readonly entries = signal<readonly ReviewEntry[]>(ENTRADAS);
  readonly canReview = signal(false);
  readonly blockedReason = signal<ReviewBlockedReason | null>(null);
  readonly prompts = signal<readonly ReviewCriterionPrompt[]>([]);
  readonly notice = signal('');
  readonly noticeIsError = signal(false);
  readonly sending = signal(false);
  readonly canReport = signal(false);
  readonly reportedIds = signal<readonly string[]>([]);
  readonly reportingId = signal<string | null>(null);
  readonly log: ReviewDraft[] = [];
  readonly reportLog: string[] = [];
}

function mount(): { fixture: ReturnType<typeof TestBed.createComponent<Host>>; host: Host } {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

const text = (fixture: { nativeElement: HTMLElement }, sel: string): string =>
  (fixture.nativeElement.querySelector(sel)?.textContent ?? '').trim();

const todos = (fixture: { nativeElement: HTMLElement }, sel: string): HTMLElement[] =>
  Array.from(fixture.nativeElement.querySelectorAll(sel)) as HTMLElement[];

describe('SH-13 syn-review-panel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  // ─── feliz ──────────────────────────────────────────────────────────────────
  it('pinta el promedio con un decimal y el conteo con el sustantivo del dominio', () => {
    const { fixture, host } = mount();
    expect(text(fixture, '.syn-reviews__average')).toBe('4,2');
    expect(text(fixture, '.syn-reviews__count')).toContain('128');

    host.config.set({ countLabel: 'reseñas' });
    fixture.detectChanges();
    expect(text(fixture, '.syn-reviews__count')).toContain('reseñas');
  });

  it('lista las reseñas, el sello de verificada y la respuesta del anfitrión', () => {
    const { fixture } = mount();
    expect(todos(fixture, '.syn-reviews__entry')).toHaveLength(2);
    expect(text(fixture, '.syn-reviews__entry-author')).toBe('Camila R.');
    // El sello sólo va donde el dominio lo afirma: la pieza no sabe qué es comprar.
    expect(todos(fixture, '.syn-reviews__verified')).toHaveLength(1);
    expect(text(fixture, '.syn-reviews__entry-reply')).toContain('ya cambiamos');
  });

  // ─── EL caso 1: la distribución ─────────────────────────────────────────────
  it('la distribución se pinta y los anchos salen de SU total, no de `count`', () => {
    const { fixture, host } = mount();
    const filas = todos(fixture, '.syn-reviews__dist-row');
    expect(filas).toHaveLength(5);

    // 64 de 128 en la distribución = 50 %. Si se usara `summary.count` daría lo
    // mismo acá por casualidad, así que el caso lo fuerza abajo.
    const relleno = fixture.nativeElement.querySelector(
      '.syn-reviews__dist-fill',
    ) as HTMLElement;
    expect(relleno.style.inlineSize).toBe('50%');

    // Lista paginada: `count` es el total del servidor (500) y la distribución
    // trae sólo lo cargado. Los anchos tienen que seguir sumando 100 %.
    host.summary.set({
      average: 4,
      count: 500,
      distribution: [
        { stars: 5, count: 3 },
        { stars: 4, count: 1 },
      ],
    });
    fixture.detectChanges();
    const anchos = todos(fixture, '.syn-reviews__dist-fill').map((n) => n.style.inlineSize);
    expect(anchos).toEqual(['75%', '25%']);
  });

  it('sin distribución no se pinta nada, no una barra vacía', () => {
    const { fixture, host } = mount();
    host.summary.set({ average: 4.2, count: 10 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.syn-reviews__dist')).toBeNull();
    expect(fixture.nativeElement.querySelector('.syn-reviews__criteria')).toBeNull();
  });

  // ─── EL caso 2: los criterios del dominio ───────────────────────────────────
  it('los criterios del dominio se muestran promediados y se PIDEN al escribir', () => {
    const { fixture, host } = mount();
    expect(todos(fixture, '.syn-reviews__criterion-label').map((n) => n.textContent?.trim())).toEqual(
      ['Limpieza', 'Ubicación'],
    );
    expect(todos(fixture, '.syn-reviews__criterion-score').map((n) => n.textContent?.trim())).toEqual(
      ['4,6', '3,9'],
    );

    host.canReview.set(true);
    host.prompts.set([
      { id: 'limpieza', label: 'Limpieza' },
      { id: 'ubicacion', label: 'Ubicación' },
    ]);
    fixture.detectChanges();

    // Una escala por criterio, más la global.
    expect(todos(fixture, 'fieldset.syn-reviews__field')).toHaveLength(3);
  });

  it('un dominio sin criterios tiene sólo la nota global', () => {
    const { fixture, host } = mount();
    host.canReview.set(true);
    host.summary.set({ average: 4.2, count: 10 });
    fixture.detectChanges();

    expect(todos(fixture, 'fieldset.syn-reviews__field')).toHaveLength(1);
  });

  // ─── el gate: a quien no puede, no se le enseña ─────────────────────────────
  it('sin poder reseñar no hay formulario, y se dice por qué', () => {
    const { fixture, host } = mount();
    expect(fixture.nativeElement.querySelector('.syn-reviews__form')).toBeNull();

    host.blockedReason.set('not-consumer');
    fixture.detectChanges();
    const aviso = text(fixture, '.syn-reviews__blocked');
    expect(aviso).toContain('Solo quien ya lo usó');
    // Y NO ofrece iniciar sesión: la sesión no es el problema (ADR 0112).
    expect(aviso.toLowerCase()).not.toContain('inicia sesión');
  });

  it('cada motivo dice lo suyo, y sin motivo no se pinta aviso', () => {
    const { fixture, host } = mount();
    host.blockedReason.set('unauthenticated');
    fixture.detectChanges();
    expect(text(fixture, '.syn-reviews__blocked').toLowerCase()).toContain('inicia sesión');

    host.blockedReason.set('already-reviewed');
    fixture.detectChanges();
    expect(text(fixture, '.syn-reviews__blocked')).toContain('Ya dejaste tu opinión');

    host.blockedReason.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.syn-reviews__blocked')).toBeNull();
  });

  // ─── enviar ─────────────────────────────────────────────────────────────────
  it('no se puede enviar sin nota ni sin cuerpo con sustancia', () => {
    const { fixture, host } = mount();
    host.canReview.set(true);
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      '.syn-reviews__submit',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    host.panel().draftRating.set(5);
    fixture.detectChanges();
    expect(boton.disabled).toBe(true); // falta el cuerpo

    host.panel().draftBody.set('Corto');
    fixture.detectChanges();
    expect(boton.disabled).toBe(true); // menos del mínimo

    host.panel().draftBody.set('Un cuerpo con sustancia suficiente.');
    fixture.detectChanges();
    expect(boton.disabled).toBe(false);
  });

  it('emite el borrador con la nota, el texto y los criterios', () => {
    const { fixture, host } = mount();
    host.canReview.set(true);
    host.prompts.set([{ id: 'limpieza', label: 'Limpieza' }]);
    fixture.detectChanges();

    host.panel().draftRating.set(4);
    host.panel().draftTitle.set('  Muy bien  ');
    host.panel().draftBody.set('  Volvería sin dudarlo.  ');
    host.panel().setCriterion('limpieza', 5);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.syn-reviews__submit') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.log).toEqual([
      {
        rating: 4,
        title: 'Muy bien',
        body: 'Volvería sin dudarlo.',
        criteria: { limpieza: 5 },
      },
    ]);
  });

  // ─── EL caso 3: la pieza NO limpia al enviar ────────────────────────────────
  it('enviar NO limpia el formulario: sólo el dominio sabe si el servidor aceptó', () => {
    const { fixture, host } = mount();
    host.canReview.set(true);
    fixture.detectChanges();
    host.panel().draftRating.set(5);
    host.panel().draftBody.set('Un cuerpo con sustancia suficiente.');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.syn-reviews__submit') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Borrar el texto antes de la confirmación es el defecto #26 con otro
    // disfraz: si el envío falla, la persona perdió lo que escribió.
    expect(host.panel().draftBody()).toBe('Un cuerpo con sustancia suficiente.');
    expect(host.panel().draftRating()).toBe(5);

    // Lo limpia el dominio, cuando el servidor dijo que sí.
    host.panel().reset();
    fixture.detectChanges();
    expect(host.panel().draftBody()).toBe('');
    expect(host.panel().draftRating()).toBe(0);
  });

  it('mientras se envía no se puede reenviar', () => {
    const { fixture, host } = mount();
    host.canReview.set(true);
    fixture.detectChanges();
    host.panel().draftRating.set(5);
    host.panel().draftBody.set('Un cuerpo con sustancia suficiente.');
    host.sending.set(true);
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      '.syn-reviews__submit',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.textContent?.trim()).toBe('Enviando…');
  });

  it('el doble clic no emite dos veces', () => {
    const { fixture, host } = mount();
    host.canReview.set(true);
    fixture.detectChanges();
    host.panel().draftRating.set(5);
    host.panel().draftBody.set('Un cuerpo con sustancia suficiente.');
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      '.syn-reviews__submit',
    ) as HTMLButtonElement;
    boton.click();
    host.sending.set(true); // el dominio marca el envío en el mismo tick
    fixture.detectChanges();
    boton.click();
    fixture.detectChanges();

    expect(host.log).toHaveLength(1);
  });

  // ─── avisos ─────────────────────────────────────────────────────────────────
  it('el aviso del dominio distingue el éxito del rechazo', () => {
    const { fixture, host } = mount();
    host.canReview.set(true);
    host.notice.set('¡Gracias! Tu opinión ya está publicada.');
    fixture.detectChanges();
    let aviso = fixture.nativeElement.querySelector('.syn-reviews__notice');
    expect(aviso?.getAttribute('role')).toBe('status');
    expect(aviso?.classList.contains('is-error')).toBe(false);

    host.notice.set('No pudimos publicar tu opinión.');
    host.noticeIsError.set(true);
    fixture.detectChanges();
    aviso = fixture.nativeElement.querySelector('.syn-reviews__notice');
    expect(aviso?.getAttribute('role')).toBe('alert');
    expect(aviso?.classList.contains('is-error')).toBe(true);
  });

  // ─── vacío ──────────────────────────────────────────────────────────────────
  it('sin reseñas invita a ser la primera, y no pinta resumen', () => {
    const { fixture, host } = mount();
    host.entries.set([]);
    host.summary.set({ average: 0, count: 0 });
    fixture.detectChanges();

    expect(text(fixture, '.syn-reviews__empty')).toContain('Sé la primera');
    expect(fixture.nativeElement.querySelector('.syn-reviews__summary')).toBeNull();
  });

  // ─── dos en la misma página ─────────────────────────────────────────────────
  // ─── moderación (#31) ───────────────────────────────────────────────────────
  describe('reportar', () => {
    it('sin permiso NO hay botón: un reporte anónimo no se puede atender', () => {
      const { fixture } = mount();
      expect(todos(fixture, '.syn-reviews__report')).toHaveLength(0);
    });

    it('con permiso hay un botón por reseña y el id sale hacia el dominio', () => {
      const { fixture, host } = mount();
      host.canReport.set(true);
      fixture.detectChanges();

      const botones = todos(fixture, '.syn-reviews__report') as HTMLButtonElement[];
      expect(botones).toHaveLength(2);

      botones[1].click();
      expect(host.reportLog).toEqual(['r2']);
    });

    it('EL caso: la misma reseña NO se reporta dos veces', () => {
      const { fixture, host } = mount();
      host.canReport.set(true);
      host.reportedIds.set(['r1']);
      fixture.detectChanges();

      // La reportada ya no ofrece botón, ofrece el acuse.
      expect(todos(fixture, '.syn-reviews__report')).toHaveLength(1);
      expect(text(fixture, '.syn-reviews__reported')).toContain('Reportada');

      // Y aunque se llame al método a mano, no vuelve a emitir.
      host.panel().onReport('r1');
      expect(host.reportLog).toEqual([]);
    });

    it('EL caso: con un reporte en vuelo no se manda otro — el doble clic es gratis', () => {
      const { fixture, host } = mount();
      host.canReport.set(true);
      host.reportingId.set('r1');
      fixture.detectChanges();

      const botones = todos(fixture, '.syn-reviews__report') as HTMLButtonElement[];
      expect((botones[0] as HTMLButtonElement).disabled).toBe(true);
      expect(text(fixture, '.syn-reviews__report')).toContain('Reportando');

      // Ni la que está en vuelo ni OTRA: el reporte en curso bloquea el envío.
      botones[0].click();
      botones[1].click();
      expect(host.reportLog).toEqual([]);
    });

    it('la pieza NO marca como reportada al emitir: eso lo dice el servidor', () => {
      const { fixture, host } = mount();
      host.canReport.set(true);
      fixture.detectChanges();

      (todos(fixture, '.syn-reviews__report')[0] as HTMLButtonElement).click();
      fixture.detectChanges();

      // Emitió, y sigue ofreciendo el botón: quien decide que quedó reportada es
      // el dominio cuando el servidor responde (#26).
      expect(host.reportLog).toEqual(['r1']);
      expect(todos(fixture, '.syn-reviews__report')).toHaveLength(2);
    });
  });

  describe('reseña en revisión', () => {
    it('EL caso: una pendiente se marca y dice que no cuenta todavía', () => {
      const { fixture, host } = mount();
      host.entries.set([{ ...ENTRADAS[0], pending: true }, ENTRADAS[1]]);
      fixture.detectChanges();

      expect(todos(fixture, '.syn-reviews__entry-pending')).toHaveLength(1);
      expect(text(fixture, '.syn-reviews__entry-pending')).toContain('revisión');
      expect(text(fixture, '.syn-reviews__entry-pending')).toContain('calificación');
    });

    it('una pendiente NO se puede reportar: todavía no es pública', () => {
      const { fixture, host } = mount();
      host.canReport.set(true);
      host.entries.set([{ ...ENTRADAS[0], pending: true }, ENTRADAS[1]]);
      fixture.detectChanges();

      expect(todos(fixture, '.syn-reviews__report')).toHaveLength(1);
    });

    it('el rótulo de la pendiente es del dominio', () => {
      const { fixture, host } = mount();
      host.entries.set([{ ...ENTRADAS[0], pending: true }]);
      host.config.set({ pendingLabel: 'Tu reseña está en revisión del docente.' });
      fixture.detectChanges();

      expect(text(fixture, '.syn-reviews__entry-pending')).toBe(
        'Tu reseña está en revisión del docente.',
      );
    });
  });

  it('dos paneles no comparten el id del título ni de los campos', () => {
    const uno = TestBed.createComponent(Host);
    uno.detectChanges();
    const dos = TestBed.createComponent(Host);
    dos.detectChanges();

    const idUno = uno.nativeElement.querySelector('.syn-reviews__heading')?.getAttribute('id');
    const idDos = dos.nativeElement.querySelector('.syn-reviews__heading')?.getAttribute('id');
    expect(idUno).toBeTruthy();
    expect(idUno).not.toBe(idDos);
  });
});
