import { CON_MUESTRAS_DE_LA_CONSOLA, ComponentFixture, ConsolaMensajesComponent, NEGOCIO_DEL_CMS, SellerElementComponent, flushMicrotasks, installFakeServer, installMemoryStorage, prepararLaConsola } from '../../arnes-de-la-consola.test';

/**
 * La consola montada entera, por los mensajes: los hilos y la respuesta que no salió (014-despiece-tienda, T013). Las pruebas son las
 * de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La consola: los mensajes', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  const { consola, createComponent } = prepararLaConsola((montado) => {
    fixture = montado;
  });

  // ── mensajes (SH-7): hilos degradados + responder agrega el mensaje ─────────
  /**
   * Lo que el CMS contesta al responder: el HILO entero (`ThreadDto`), con la respuesta al
   * final y el `from` como el correo del member. El id `msg_77` no lo puede producir el
   * respaldo de antes (`msg-<ts>`), y la fecha es la del SERVIDOR, no la de hoy (regla 7).
   */
  const HILO_RESPONDIDO = {
    threadId: 'th-1',
    contextRef: 'P-1',
    participants: ['comprador@correo.co', 'vendedor@tienda.co'],
    messages: [
      { messageId: 'msg_1', from: 'comprador@correo.co', body: '¿Tiene garantía?', sentAt: '2026-09-30T10:00:00+00:00' },
      { messageId: 'msg_77', from: 'vendedor@tienda.co', body: 'Sí, tiene garantía de 12 meses.', sentAt: '2026-09-30T15:00:00+00:00' },
    ],
    createdAt: '2026-09-30T10:00:00+00:00',
    lastMessageAt: '2026-09-30T15:00:00+00:00',
  };

  /**
   * Abre «Mensajes» y el primer hilo sin leer. Los hilos salen de la demo (la marca): la bandeja de hoy no se
   * lee —`GET messages` contesta `threadId` y no `id`, y eso lo arregla T031—. Lo que se prueba acá es la
   * RESPUESTA, que va al servidor.
   */
  async function abrirHiloSinLeer(): Promise<number> {
    consola().estado.goTo('mensajes');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(consola().estado.threads().length).toBeGreaterThan(0);

    const unread = consola().estado.threads().find((thread) => thread.unread);
    expect(unread).toBeDefined();
    consola().vista(ConsolaMensajesComponent).onThreadSelect(unread!);
    expect(consola().vista(ConsolaMensajesComponent).activeThread()?.id).toBe(unread!.id);
    // Opening the thread clears its unread flag.
    expect(consola().estado.threads().find((thread) => thread.id === unread!.id)?.unread).toBe(false);
    return consola().vista(ConsolaMensajesComponent).activeThread()!.messages.length;
  }

  it('loads buyer threads and appends the seller reply to the active thread', async () => {
    installMemoryStorage();
    installFakeServer({ 'POST /reply': HILO_RESPONDIDO });
    await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);
    const before = await abrirHiloSinLeer();

    await consola().vista(ConsolaMensajesComponent).onSendReply({
      thread: consola().vista(ConsolaMensajesComponent).activeThread()!,
      body: 'Sí, tiene garantía de 12 meses.',
    });

    const active = consola().vista(ConsolaMensajesComponent).activeThread()!;
    expect(active.messages.length).toBe(before + 1);
    // La respuesta que guardó el SERVIDOR: su id y su fecha, del final del hilo que devolvió.
    expect(active.messages.at(-1)).toEqual({
      id: 'msg_77',
      from: 'seller',
      body: 'Sí, tiene garantía de 12 meses.',
      date: '2026-09-30',
    });
    expect(consola().estado.actionError()).toBeNull();
    expect(consola().vista(ConsolaMensajesComponent).sending()).toBe(false);
  });

  // ── UI#92: una respuesta que no salió se queda MARCADA, no con cara de enviada ─
  it('con el POST /reply caído la respuesta queda marcada en el hilo, se dice una vez y se reintenta', async () => {
    installMemoryStorage();
    installFakeServer({}); // nada contesta: el POST /reply sale 404
    await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);
    const before = await abrirHiloSinLeer();

    await consola().vista(ConsolaMensajesComponent).onSendReply({
      thread: consola().vista(ConsolaMensajesComponent).activeThread()!,
      body: 'Sí, tiene garantía de 12 meses.',
    });
    fixture.detectChanges();

    const marcada = consola().vista(ConsolaMensajesComponent).activeThread()!.messages.at(-1)!;
    expect(consola().vista(ConsolaMensajesComponent).activeThread()!.messages.length).toBe(before + 1);
    // El texto no se pierde, pero no lleva fecha: sería el acuse que no existe.
    expect(marcada).toMatchObject({ from: 'seller', body: 'Sí, tiene garantía de 12 meses.', date: '', failed: true });
    const host = fixture.nativeElement as HTMLElement;
    expect(Array.from(host.querySelectorAll('[role="alert"]')).map((alerta) => alerta.textContent?.trim())).toEqual([
      'Tu respuesta NO se envió. Queda en el hilo para reintentarla.',
    ]);

    // Reintentar desde el hilo, ya con el borde arriba: la marcada se vuelve LA del servidor.
    installFakeServer({ 'POST /reply': HILO_RESPONDIDO });
    await consola().vista(ConsolaMensajesComponent).retryReply(consola().vista(ConsolaMensajesComponent).activeThread()!, marcada);

    const active = consola().vista(ConsolaMensajesComponent).activeThread()!;
    expect(active.messages.length).toBe(before + 1);
    expect(active.messages.at(-1)).toEqual({
      id: 'msg_77',
      from: 'seller',
      body: 'Sí, tiene garantía de 12 meses.',
      date: '2026-09-30',
    });
    expect(consola().estado.actionError()).toBeNull();
  });
});
