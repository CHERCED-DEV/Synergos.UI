import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MessageCenterComponent,
  type MessageCenterConfig,
  type MessageSendEvent,
} from './message-center';

interface Thread {
  readonly id: string;
  readonly subject: string;
  readonly messages: readonly string[];
}

const THREAD_A: Thread = { id: 'th-1', subject: 'Garantía', messages: ['¿Trae garantía?'] };
const THREAD_B: Thread = { id: 'th-2', subject: 'Envío', messages: ['¿Llega mañana?'] };

const CONFIG: MessageCenterConfig = {
  heading: 'Mensajes',
  emptyMessage: 'Sin conversaciones todavía',
  detailPlaceholder: 'Abre una conversación',
  sendLabel: 'Responder',
};

@Component({
  standalone: true,
  imports: [MessageCenterComponent],
  template: `
    <ng-template #row let-thread let-selected="selected">
      <span class="row-subject" [attr.data-selected]="selected">{{ thread.subject }}</span>
    </ng-template>
    <ng-template #detail let-thread>
      <p class="thread-body" [attr.data-thread]="thread.id">
        {{ thread.messages.join(' · ') }}
      </p>
    </ng-template>
    <syn-message-center
      [config]="config()"
      [threads]="threads()"
      [activeThread]="active()"
      [loading]="loading()"
      [sending]="sending()"
      [threadTemplate]="row"
      [detailTemplate]="detail"
      (threadselect)="active.set($event); selectLog.push($event.id)"
      (send)="sendLog.push($event)"
    />
  `,
})
class HostComponent {
  readonly config = signal<MessageCenterConfig>(CONFIG);
  readonly threads = signal<readonly Thread[]>([]);
  readonly active = signal<Thread | null>(null);
  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly selectLog: string[] = [];
  readonly sendLog: MessageSendEvent<Thread>[] = [];
}

describe(MessageCenterComponent.name, () => {
  async function createHost() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function composer(fixture: { nativeElement: HTMLElement }): {
    input: HTMLTextAreaElement;
    sendBtn: HTMLButtonElement;
  } {
    return {
      input: fixture.nativeElement.querySelector<HTMLTextAreaElement>('.syn-messages__input')!,
      sendBtn: fixture.nativeElement.querySelector<HTMLButtonElement>('.syn-messages__send')!,
    };
  }

  function type(input: HTMLTextAreaElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty ───────────────────────────────────────────────────────────────────
  it('shows the empty list message and the detail placeholder without composer (empty case)', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.syn-messages__heading')?.textContent).toContain('Mensajes');
    expect(element.querySelector('.syn-messages__empty')?.textContent).toContain(
      'Sin conversaciones todavía',
    );
    expect(element.querySelector('.syn-messages__placeholder')?.textContent).toContain(
      'Abre una conversación',
    );
    expect(element.querySelector('.syn-messages__composer')).toBeNull();
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('selects a thread, renders its detail and sends a reply (happy case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.threads.set([THREAD_A, THREAD_B]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const rows = element.querySelectorAll<HTMLButtonElement>('.syn-messages__row');
    expect(rows).toHaveLength(2);

    rows[1].click();
    fixture.detectChanges();
    expect(host.selectLog).toEqual(['th-2']);
    expect(element.querySelector('.thread-body')?.getAttribute('data-thread')).toBe('th-2');

    const { input, sendBtn } = composer(fixture);
    expect(sendBtn.disabled).toBe(true);
    type(input, '  Sí, llega mañana.  ');
    fixture.detectChanges();
    expect(sendBtn.disabled).toBe(false);

    sendBtn.click();
    fixture.detectChanges();
    expect(host.sendLog).toEqual([{ thread: THREAD_B, body: 'Sí, llega mañana.' }]);
    // Composer clears after a successful send.
    expect(element.querySelector<HTMLTextAreaElement>('.syn-messages__input')?.value).toBe('');
  });

  // ── filter ──────────────────────────────────────────────────────────────────
  it('marks only the active row selected and gates the composer while sending (filter case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.threads.set([THREAD_A, THREAD_B]);
    host.active.set(THREAD_A);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const rows = element.querySelectorAll<HTMLButtonElement>('.syn-messages__row');
    expect(rows[0].classList.contains('is-selected')).toBe(true);
    expect(rows[1].classList.contains('is-selected')).toBe(false);
    expect(element.querySelector('.row-subject[data-selected="true"]')?.textContent).toContain(
      'Garantía',
    );

    const { input, sendBtn } = composer(fixture);
    type(input, 'Respuesta');
    host.sending.set(true);
    fixture.detectChanges();
    expect(sendBtn.disabled).toBe(true);
    expect(sendBtn.textContent).toContain('Enviando…');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(host.sendLog).toEqual([]);
  });

  // ── idempotent ─────────────────────────────────────────────────────────────
  it('re-selecting the active thread or sending an empty body emits nothing (idempotent case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.threads.set([THREAD_A]);
    host.active.set(THREAD_A);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.syn-messages__row')!.click();
    fixture.detectChanges();
    expect(host.selectLog).toEqual([]);

    const { input } = composer(fixture);
    type(input, '   ');
    fixture.detectChanges();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(host.sendLog).toEqual([]);
  });
});
