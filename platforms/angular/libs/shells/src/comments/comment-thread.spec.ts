import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommentThreadComponent,
  type CommentThreadConfig,
  type CommentThreadDraftChange,
  type CommentThreadEntry,
} from './comment-thread';

/**
 * SH-15 (012-blogs-social, I2, T016).
 *
 * Lo que hace honesta a la pieza es que NO decide: no limpia la caja de respuesta al enviar ni marca el «me gusta» por
 * su cuenta —eso lo sabe sólo el dominio, cuando el servidor contesta (#26)—, y su molde de carga es mudo para el lector
 * pero deja un aviso CON TEXTO que sí se lee.
 */

const RESPUESTA: CommentThreadEntry = {
  id: 'c-2',
  author: 'Andrés P.',
  handle: 'andres',
  initials: 'AP',
  body: 'Totalmente de acuerdo.',
  time: 'hace 2 min',
  likes: '0',
  liked: false,
  replies: [],
};

const COMENTARIO: CommentThreadEntry = {
  id: 'c-1',
  author: 'Camila Restrepo',
  handle: 'camila',
  initials: 'CR',
  body: 'Muy buen artículo, gracias por compartir.',
  time: 'hace 1 h',
  likes: '1,2 k',
  liked: false,
  replies: [RESPUESTA],
};

@Component({
  standalone: true,
  imports: [CommentThreadComponent],
  template: `
    <syn-comment-thread
      [entries]="entries()"
      [drafts]="drafts()"
      [loading]="loading()"
      [skeletons]="skeletons()"
      idPrefix="hilo-de-prueba"
      [config]="config()"
      (like)="likes.push($event)"
      (reply)="replies.push($event)"
      (draftChange)="onDraft($event)"
      (authorSelect)="authors.push($event)"
    />
  `,
})
class AnfitrionComponent {
  readonly entries = signal<readonly CommentThreadEntry[]>([COMENTARIO]);
  readonly drafts = signal<Readonly<Record<string, string>>>({});
  readonly loading = signal(false);
  readonly skeletons = signal(3);
  readonly config = signal<CommentThreadConfig>({});

  readonly likes: CommentThreadEntry[] = [];
  readonly replies: CommentThreadEntry[] = [];
  readonly authors: CommentThreadEntry[] = [];
  readonly cambios: CommentThreadDraftChange[] = [];

  onDraft(cambio: CommentThreadDraftChange): void {
    this.cambios.push(cambio);
    this.drafts.update((actual) => ({ ...actual, [cambio.entry.id]: cambio.value }));
  }
}

describe('syn-comment-thread (SH-15)', () => {
  async function montar(): Promise<{ anfitrion: AnfitrionComponent; host: HTMLElement; asentar: () => Promise<void> }> {
    await TestBed.configureTestingModule({
      imports: [AnfitrionComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(AnfitrionComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return {
      anfitrion: fixture.componentInstance,
      host: fixture.nativeElement as HTMLElement,
      asentar: async () => {
        fixture.detectChanges();
        await fixture.whenStable();
      },
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  /** El botón de verdad de un `syn-button` (el que recibe el clic y el `disabled`). */
  function boton(contenedor: Element): HTMLButtonElement {
    const nativo = contenedor.querySelector('button');
    expect(nativo).not.toBeNull();
    return nativo as HTMLButtonElement;
  }

  it('sin comentarios ni carga dice que no hay, con el texto del dominio si lo da (empty)', async () => {
    const { anfitrion, host, asentar } = await montar();
    anfitrion.entries.set([]);
    await asentar();
    expect(host.querySelector('.syn-cthread__empty')?.textContent?.trim()).toBe('Sé el primero en comentar.');

    anfitrion.config.set({ emptyMessage: 'Todavía nadie respondió.' });
    await asentar();
    expect(host.querySelector('.syn-cthread__empty')?.textContent?.trim()).toBe('Todavía nadie respondió.');
    expect(host.querySelector('.syn-cthread__comment')).toBeNull();
  });

  it('mientras carga pinta un molde MUDO con la forma del comentario, y un aviso que SÍ se lee', async () => {
    const { anfitrion, host, asentar } = await montar();
    anfitrion.entries.set([]);
    anfitrion.loading.set(true);
    anfitrion.skeletons.set(4);
    await asentar();

    // La forma real: avatar, cabecera, cuerpo, acción y caja de respuesta, una vez por fila.
    for (const parte of ['avatar', 'head', 'text', 'action', 'form']) {
      expect(host.querySelectorAll(`.syn-cthread__bone--${parte}`).length, parte).toBe(4);
    }
    // Las mismas clases que el comentario: la geometría no se duplica.
    expect(host.querySelectorAll('.syn-cthread__comment').length).toBe(4);
    expect(host.querySelector('.syn-cthread__bone')?.closest('[aria-hidden="true"]')).not.toBeNull();

    const aviso = host.querySelector('[role="status"]');
    expect(aviso?.textContent?.trim()).toBe('Cargando comentarios…');
    expect(aviso?.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('con comentarios cargados no pinta el molde aunque siga cargando (refresco)', async () => {
    const { anfitrion, host, asentar } = await montar();
    anfitrion.loading.set(true);
    await asentar();
    expect(host.querySelector('.syn-cthread__bone')).toBeNull();
    expect(host.querySelectorAll('.syn-cthread__comment').length).toBe(2);
  });

  it('pinta cada comentario con lo que el dominio ya dijo, y sus respuestas anidadas (happy)', async () => {
    const { host } = await montar();
    const [raiz, respuesta] = Array.from(host.querySelectorAll<HTMLElement>('.syn-cthread__comment'));

    expect(raiz.querySelector('.syn-cthread__author')?.textContent?.trim()).toBe('Camila Restrepo');
    expect(raiz.querySelector('.syn-cthread__handle')?.textContent?.trim()).toBe('@camila');
    expect(raiz.querySelector('.syn-cthread__time')?.textContent?.trim()).toBe('· hace 1 h');
    expect(raiz.querySelector('.syn-cthread__avatar')?.textContent?.trim()).toBe('CR');
    expect(raiz.querySelector('.syn-cthread__text')?.textContent).toBe('Muy buen artículo, gracias por compartir.');
    // La cifra llega formateada: la pieza no la toca.
    expect(raiz.querySelector('.syn-cthread__actions')?.textContent?.trim()).toBe('1,2 k');

    expect(respuesta.classList).toContain('syn-cthread__comment--nested');
    expect(respuesta.closest('.syn-cthread__list--replies')).not.toBeNull();
  });

  it('sólo el primer nivel lleva caja de respuesta, con el id del prefijo', async () => {
    const { host } = await montar();
    const cajas = host.querySelectorAll('.syn-cthread__reply-form');
    expect(cajas.length).toBe(1);
    expect(host.querySelector('#hilo-de-prueba-reply-c-1')).not.toBeNull();
    expect(host.querySelector('#hilo-de-prueba-reply-c-2')).toBeNull();
  });

  it('responder: el borrador lo guarda quien usa la pieza, y enviar NO lo borra (#26)', async () => {
    const { anfitrion, host, asentar } = await montar();
    const caja = host.querySelector<HTMLInputElement>('#hilo-de-prueba-reply-c-1');
    const formulario = host.querySelector('.syn-cthread__reply-form') as HTMLFormElement;
    const enviar = boton(formulario.querySelector('syn-button[type="submit"]') as Element);

    // Vacía o con espacios, no se ofrece enviar.
    expect(enviar.disabled).toBe(true);
    caja!.value = '   ';
    caja!.dispatchEvent(new Event('input'));
    await asentar();
    expect(enviar.disabled).toBe(true);

    caja!.value = 'Gracias a ti';
    caja!.dispatchEvent(new Event('input'));
    await asentar();
    expect(anfitrion.cambios.at(-1)).toEqual({ entry: COMENTARIO, value: 'Gracias a ti' });
    expect(enviar.disabled).toBe(false);

    formulario.dispatchEvent(new Event('submit', { cancelable: true }));
    await asentar();
    expect(anfitrion.replies).toEqual([COMENTARIO]);
    // La pieza no decide si el servidor lo guardó: el texto sigue en la caja.
    expect(host.querySelector<HTMLInputElement>('#hilo-de-prueba-reply-c-1')?.value).toBe('Gracias a ti');
  });

  it('«me gusta» sale hacia el dominio, y un comentario ya marcado no lo ofrece otra vez (idempotent)', async () => {
    const { anfitrion, host, asentar } = await montar();
    const accion = (): HTMLButtonElement =>
      boton(host.querySelector('.syn-cthread__comment .syn-cthread__actions') as Element);

    accion().click();
    await asentar();
    expect(anfitrion.likes).toEqual([COMENTARIO]);
    // La pieza no lo marca sola: sigue sin marcar hasta que el dominio le pase `liked`.
    expect(accion().getAttribute('aria-pressed')).toBe('false');

    anfitrion.entries.set([{ ...COMENTARIO, liked: true, likes: '1,2 k' }]);
    await asentar();
    expect(accion().disabled).toBe(true);
    expect(accion().getAttribute('aria-pressed')).toBe('true');
    accion().click();
    await asentar();
    expect(anfitrion.likes.length).toBe(1);
  });

  it('el nombre de quien escribió abre a esa persona', async () => {
    const { anfitrion, host, asentar } = await montar();
    const respuesta = host.querySelectorAll('.syn-cthread__comment')[1];
    boton(respuesta.querySelector('.syn-cthread__head') as Element).click();
    await asentar();
    expect(anfitrion.authors).toEqual([RESPUESTA]);
  });

  it('un comentario sin alias no pinta una arroba suelta', async () => {
    const { anfitrion, host, asentar } = await montar();
    anfitrion.entries.set([{ ...COMENTARIO, handle: undefined, replies: [] }]);
    await asentar();
    expect(host.querySelector('.syn-cthread__handle')).toBeNull();
  });
});
