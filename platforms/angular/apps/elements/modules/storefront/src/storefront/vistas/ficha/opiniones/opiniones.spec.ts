import { ComponentFixture, PRODUCT_A, ResenasApi, StorefrontElementComponent, TestBed, TiendaFichaOpinionesComponent, flushMicrotasks, installMemoryStorage, prepararLaTienda } from '../../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por las opiniones: reseñar y la reseña en revisión (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: las opiniones', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  const { tienda, createComponent } = prepararLaTienda((montado) => {
    fixture = montado;
  });

  // ── Reseñar (T10 Ola B): el formulario y el envío ───────────────────────────
  //
  // Lo que se prueba aquí no es que el formulario pinte, sino DOS invariantes:
  // (1) no se le ofrece a quien no puede reseñar, y (2) un envío que falla NO se
  // anuncia como publicado. Fingir una escritura que no ocurrió es el fallo que
  // ADR 0112 documenta en gov.mockDecide.
  describe('reseñar', () => {
    /** El cliente suelto: estos casos prueban el CONTRATO HTTP, sin montar el componente. */
    function reviewClient(): ResenasApi {
      return TestBed.inject(ResenasApi);
    }

    it('NO ofrece el formulario cuando el servidor dice que no se puede', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      // En modo degradado canReview es false por diseño: el backend que decide
      // quién puede es justo el que no responde.
      expect(tienda().resenas.canReview()).toBe(false);
    });

    it('un 403 NO se anuncia como publicado, y no invita a iniciar sesión', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: false, status: 403 } as Response)),
      );
      const client = reviewClient();

      const result = await client.submitReview('/api/shop', 'SKU-1', {
        rating: 5,
        title: 't',
        body: 'b',
      });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('not-buyer');
    });

    it('distingue 401 (entra) de 403 (compraste) de 400 (revisa) de caída de red', async () => {
      const client = reviewClient();
      const cases: ReadonlyArray<readonly [number | 'network', string]> = [
        [401, 'unauthenticated'],
        [403, 'not-buyer'],
        [400, 'invalid'],
        [500, 'failed'],
        ['network', 'failed'],
      ];

      for (const [status, expected] of cases) {
        vi.stubGlobal(
          'fetch',
          vi.fn(() =>
            status === 'network'
              ? Promise.reject(new Error('offline'))
              : Promise.resolve({ ok: false, status } as Response),
          ),
        );
        const result = await client.submitReview('/api/shop', 'SKU-1', {
          rating: 4,
          title: '',
          body: 'x',
        });
        expect(result.ok === false && result.reason).toBe(expected);
      }
    });

    it('un envío correcto se reporta como correcto', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)),
      );
      const client = reviewClient();

      const result = await client.submitReview('/api/shop', 'SKU-1', {
        rating: 5,
        title: 'Bueno',
        body: 'Cumple',
      });

      expect(result.ok).toBe(true);
    });

    // La REGLA de «sin nota o sin texto no se envía» se mudó a SH-13 con #28 y
    // tiene su caso allá. Lo que sigue siendo de la Tienda es el CABLEADO: que el
    // botón de la pieza esté gateado de verdad en esta pantalla, y que un segundo
    // envío mientras el primero está en vuelo no salga.
    it('el botón de publicar sale gateado, y no se reenvía mientras hay uno en vuelo', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      abrirFicha(true);

      const boton = fixture.nativeElement.querySelector(
        '.syn-reviews__submit',
      ) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);

      const panel = tienda().vista(TiendaFichaOpinionesComponent).reviewPanel()!;
      panel.draftRating.set(4);
      panel.draftBody.set('Cumple lo que promete.');
      fixture.detectChanges();
      expect(boton.disabled).toBe(false);

      let envios = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          envios += 1;
          return new Promise(() => undefined); // nunca resuelve: deja el latch puesto
        }) as unknown as typeof fetch,
      );
      boton.click();
      fixture.detectChanges();
      boton.click();
      await flushMicrotasks();

      expect(envios).toBe(1);
    });

    /** Ficha mínima para pintar la PDP, con el permiso que se quiera probar. */
    /** Tres reseñas con notas distintas, para que la distribución tenga forma. */
    const RESEÑAS = [
      { id: 'r1', author: 'Ana', rating: 5, title: 'Muy bien', body: 'Cumple', date: 'ayer' },
      { id: 'r2', author: 'Beto', rating: 4, title: '', body: 'Bien', date: 'ayer' },
      { id: 'r3', author: 'Cira', rating: 2, title: '', body: 'Regular', date: 'ayer' },
    ];

    function abrirFicha(canReview: boolean, reviews = RESEÑAS): void {
      tienda().catalogo.detail.set({
        product: { ...PRODUCT_A, id: 'SKU-1' },
        description: 'desc',
        variants: [],
        reviews,
        questions: [],
        canReview,
      });
      tienda().navegacion.view.set('pdp');
      fixture.detectChanges();
    }

    it('con permiso del servidor, el formulario se PINTA con sus partes', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      abrirFicha(true);

      const form = fixture.nativeElement.querySelector('.syn-reviews__form');
      expect(form).toBeTruthy();
      // Desde #28 la escala la pinta la pieza como radiogroup propio y no
      // `<synergos-rating-stars>`: un shell del catálogo no puede dar por
      // registrado un custom element del CDN.
      expect(form.querySelector('[role="radiogroup"]')).toBeTruthy();
      expect(form.querySelectorAll('[role="radio"]')).toHaveLength(5);
      expect(form.querySelector('textarea')).toBeTruthy();
      // Sin nota ni texto no se puede enviar: el botón nace deshabilitado.
      expect(form.querySelector('.syn-reviews__submit').disabled).toBe(true);
    });

    it('sin permiso del servidor NO se pinta, aunque la ficha esté abierta', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      abrirFicha(false);

      expect(fixture.nativeElement.querySelector('.syn-reviews__form')).toBeNull();
      // …y las opiniones existentes se siguen leyendo: ocultar el formulario no oculta el bloque.
      expect(fixture.nativeElement.querySelector('syn-review-panel')).toBeTruthy();
    });

    it('un 403 al enviar NO dice "publicada" y no ofrece iniciar sesión', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      abrirFicha(true);

      // El borrador vive en SH-13 desde #28; la regla de negocio no cambió.
      const panel = tienda().vista(TiendaFichaOpinionesComponent).reviewPanel();
      expect(panel).toBeTruthy();
      panel!.draftRating.set(5);
      panel!.draftBody.set('Cumple lo que promete.');
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403 } as Response)));

      await tienda().vista(TiendaFichaOpinionesComponent).submitReview({
        rating: 5,
        title: '',
        body: 'Cumple lo que promete.',
        criteria: {},
      });

      expect(tienda().resenas.reviewFailed()).toBe(true);
      expect(tienda().resenas.reviewNotice()).toContain('compró');
      // Los dos fallos que importan: anunciar una escritura que no ocurrió…
      expect(tienda().resenas.reviewNotice()).not.toContain('publicada');
      // …y mandar a iniciar sesión por un problema que no es de sesión.
      expect(tienda().resenas.reviewNotice().toLowerCase()).not.toContain('inicia sesión');
      // El texto se conserva: perder lo escrito por un rechazo sería castigar dos
      // veces. Ahora lo custodia la pieza, que no se limpia sola al enviar.
      expect(panel!.draftBody()).toBe('Cumple lo que promete.');
    });

    it('monta SH-13 y pinta la distribución que antes se calculaba sin usarse', async () => {
      // Monta su propia tienda: antes leía la que dejaba la prueba de arriba, ya destruida (014-despiece-tienda).
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      abrirFicha(true);

      expect(fixture.nativeElement.querySelector('syn-review-panel')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.storefront__review-form')).toBeNull();
      // `reviewSummary().distribution` existía desde siempre y ninguna plantilla
      // la usaba: cinco barras, una por estrella.
      expect(
        fixture.nativeElement.querySelectorAll('.syn-reviews__dist-row').length,
      ).toBe(5);
      expect(tienda().vista(TiendaFichaOpinionesComponent).reviewPanelSummary().distribution?.map((b) => b.stars)).toEqual([
        5, 4, 3, 2, 1,
      ]);
    });
  });

  // ── moderación: el acuse dice la verdad (#31) ────────────────────────────────
  describe('reseña en revisión', () => {
    /** Deja la PDP abierta con un producto que SÍ se puede reseñar. */
    async function abrirFichaReseñable(): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      tienda().navegacion.openProduct(tienda().catalogo.products()[0]);
      await flushMicrotasks();
      fixture.detectChanges();
    }

    it('EL caso: un 202 NO dice «publicada» y NO recarga la lista', async () => {
      await abrirFichaReseñable();
      const sku = tienda().catalogo.detail()!.product.id;

      // Sólo el POST de la reseña contesta; cualquier recarga posterior se vería
      // como una llamada más a la ficha, que es justo lo que se comprueba.
      const llamadas: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          llamadas.push(String(url));
          return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({}) } as Response);
        }),
      );

      await tienda().vista(TiendaFichaOpinionesComponent).submitReview({
        rating: 5,
        title: 'Muy bueno',
        body: 'Cumple lo que promete y llegó antes de lo previsto.',
        criteria: {},
      });

      expect(tienda().resenas.reviewNotice()).toContain('en revisión');
      expect(tienda().resenas.reviewNotice()).not.toContain('publicada');
      expect(tienda().resenas.reviewFailed()).toBe(false);
      // Ni una sola recarga de la ficha: traería la lista SIN la reseña, o sea la
      // prueba de que el acuse miente, en la misma pantalla.
      expect(llamadas.filter((u) => u.includes(`/product/${sku}`))).toEqual([]);
    });

    it('un 201 sí dice publicada y sí recarga', async () => {
      await abrirFichaReseñable();
      const sku = tienda().catalogo.detail()!.product.id;

      const llamadas: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          llamadas.push(String(url));
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
        }),
      );

      await tienda().vista(TiendaFichaOpinionesComponent).submitReview({
        rating: 5,
        title: 'Muy bueno',
        body: 'Cumple lo que promete y llegó antes de lo previsto.',
        criteria: {},
      });

      expect(tienda().resenas.reviewNotice()).toContain('publicada');
      expect(llamadas.some((u) => u.includes(`/product/${sku}`))).toBe(true);
    });

    it('reportar dos veces la misma no manda dos peticiones', async () => {
      await abrirFichaReseñable();

      let envios = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          envios += 1;
          return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({}) } as Response);
        }),
      );

      await tienda().resenas.reportReview('rev-1');
      await tienda().resenas.reportReview('rev-1');

      expect(envios).toBe(1);
      expect(tienda().resenas.reportedReviewIds()).toEqual(['rev-1']);
      expect(tienda().resenas.reviewNotice()).toContain('Gracias por avisar');
    });

    it('«ya reportada» se trata como éxito: reintentar no arregla nada', async () => {
      await abrirFichaReseñable();
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) } as Response),
        ),
      );

      await tienda().resenas.reportReview('rev-9');

      expect(tienda().resenas.reportedReviewIds()).toEqual(['rev-9']);
      expect(tienda().resenas.reviewFailed()).toBe(false);
    });
  });
});
