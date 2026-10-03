import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SHARE_BAR_SYNHOST } from '@synergos/contracts';
import {
  ShareBarElementComponent,
  type CopyLinkDetail,
  type ShareSelectDetail,
  buildShareUrl,
  normalizePlatforms,
} from './share-bar';

describe('ShareBarElementComponent', () => {
  let fixture: ComponentFixture<ShareBarElementComponent>;
  let component: ShareBarElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShareBarElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ShareBarElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render the default network set (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasPlatforms()).toBe(true);
    // No `platforms` configured → canonical default set.
    expect(component.platforms().map((p) => p.id)).toEqual([
      'facebook',
      'x',
      'linkedin',
      'whatsapp',
      'email',
    ]);
    expect(component.copyState()).toBe('idle');
  });

  it('should honor a CSV platforms list and explicit shareLink/title (render/config case)', () => {
    fixture.componentRef.setInput('platforms', 'x, linkedin, basura, x');
    fixture.componentRef.setInput('shareLink', 'https://synergos.example/post');
    fixture.componentRef.setInput('shareTitle', 'Hola mundo');
    fixture.detectChanges();

    // Invalid id dropped, duplicate collapsed, order preserved.
    expect(component.platforms().map((p) => p.id)).toEqual(['x', 'linkedin']);
    expect(component.shareUrl()).toBe('https://synergos.example/post');
    expect(component.shareTitle()).toBe('Hola mundo');

    const url = component.platforms()[0];
    const intent = buildShareUrl(url.id, component.shareUrl(), component.shareTitle());
    expect(intent).toContain('twitter.com/intent/tweet');
    expect(intent).toContain(encodeURIComponent('https://synergos.example/post'));
  });

  it('should emit share on click and copylink on copy (interaction case)', async () => {
    fixture.componentRef.setInput('platforms', 'linkedin');
    fixture.componentRef.setInput('shareLink', 'https://synergos.example/x');
    fixture.detectChanges();

    const opened: string[] = [];
    // `spyOn(...).and.callFake(...)` es sintaxis de JASMINE y este workspace corre Vitest:
    // el spec no fallaba, NI SIQUIERA COMPILABA (`spyOn` no existe como global). Llevaba
    // así desde que se escribió, invisible porque el proyecto no declaraba target `test`.
    vi.spyOn(window, 'open').mockImplementation((u?: string | URL) => {
      opened.push(String(u));
      return null;
    });

    let shared: ShareSelectDetail | undefined;
    component.share.subscribe((detail) => (shared = detail));
    component.onShare(component.platforms()[0]);

    expect(shared?.platform).toBe('linkedin');
    expect(shared?.url).toBe('https://synergos.example/x');
    expect(opened[0]).toContain('linkedin.com');

    let copied: CopyLinkDetail | undefined;
    component.copylink.subscribe((detail) => (copied = detail));

    // El portapapeles hay que STUBEARLO, no darlo por hecho: jsdom no implementa
    // `navigator.clipboard` NI `document.execCommand`, así que las dos ramas de
    // `writeClipboard` fallan y el componente reporta ok:false — correctamente, porque
    // de verdad no pudo copiar. El componente no está roto; el test asumía un navegador.
    // Stubeando la API se prueba lo que de verdad se quiere afirmar: que cuando el
    // portapapeles SÍ funciona, se emite ok:true y el estado pasa a 'copied'.
    const escrito: string[] = [];
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: (t: string) => { escrito.push(t); return Promise.resolve(); } },
    });

    await component.onCopyLink();

    expect(escrito).toEqual(['https://synergos.example/x']);
    expect(copied?.url).toBe('https://synergos.example/x');
    expect(copied?.ok).toBe(true);
    expect(component.copyState()).toBe('copied');

    // Y la rama contraria, que es la que este entorno produce de forma natural: sin API
    // de portapapeles el componente NO miente — reporta el fallo y lo refleja en su estado.
    vi.unstubAllGlobals();
    await component.onCopyLink();
    expect(copied?.ok).toBe(false);
    expect(component.copyState()).toBe('failed');
  });

  it('should let direct inputs override config (idempotent precedence)', () => {
    fixture.componentRef.setInput(
      'config',
      '{"platforms":["facebook"],"shareTitle":"Desde config"}',
    );
    fixture.componentRef.setInput('shareTitle', 'Desde atributo');
    fixture.detectChanges();

    // Attribute wins over config; config still supplies platforms.
    expect(component.shareTitle()).toBe('Desde atributo');
    expect(component.platforms().map((p) => p.id)).toEqual(['facebook']);

    // Re-applying the same inputs yields the same resolved state.
    fixture.componentRef.setInput('shareTitle', 'Desde atributo');
    fixture.detectChanges();
    expect(component.shareTitle()).toBe('Desde atributo');
    expect(component.platforms().map((p) => p.id)).toEqual(['facebook']);
  });

  // D1: con `platformsCsv`/`shareUrl` —lo que mandaba la vista— la barra pintaba las redes de
  // fábrica y compartía la página actual. Éste alimenta el `config` EXACTO que emite hoy la vista.
  it('pinta las redes y comparte el destino que el editor eligió con el config exacto que emite la vista del CMS', () => {
    const { ejemplo } = SHARE_BAR_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();

    expect(component.platforms().map((p) => p.id)).toEqual(ejemplo.platforms);
    expect(component.shareUrl()).toBe(ejemplo.shareLink);
    expect(component.shareTitle()).toBe(ejemplo.shareTitle);
  });

  // CMS#192, caso 20: el editor elige reddit/pinterest y el botón aparece, con su nombre y su glifo.
  it('pinta los botones de reddit y pinterest cuando el CMS los manda', () => {
    fixture.componentRef.setInput('config', JSON.stringify({ platforms: ['reddit', 'pinterest'] }));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const botones = ['reddit', 'pinterest'].map((red) => host.querySelector(`.share-bar__action--${red}`));
    expect(botones.map((boton) => boton?.getAttribute('aria-label'))).toEqual([
      'Compartir en Reddit',
      'Compartir en Pinterest',
    ]);
    expect(botones.every((boton) => (boton?.querySelector('path')?.getAttribute('d') ?? '').length > 0)).toBe(true);
  });

  // ADR 0136 (CMS#191): la microcopia sale de la sección `Share` que publica la página; el nombre
  // de la red es marca y lo pone el elemento.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO, con el nombre de la red del catálogo', () => {
      fixture.componentRef.setInput('config', JSON.stringify(SHARE_BAR_SYNHOST.ejemplo));
      fixture.detectChanges();

      expect(component.platforms().map((p) => p.label)).toEqual([
        'Compartir en WhatsApp',
        'Compartir en X',
        'Compartir en LinkedIn',
      ]);
      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('.share-bar__label')?.textContent?.trim()).toBe('Compartir');
      expect(raiz.querySelector('.share-bar__action--copy')?.getAttribute('aria-label')).toBe('Copiar enlace');
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: {
          culture: 'en-US',
          defaultCulture: 'es-CO',
          keys: { 'Share.Label': 'Share', 'Share.On': 'Share on {network}', 'Share.Copy': 'Copy link' },
        },
      };
      const otra = TestBed.createComponent(ShareBarElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(SHARE_BAR_SYNHOST.ejemplo));
      otra.detectChanges();

      const c = otra.componentInstance;
      expect(c.platforms()[0].label).toBe('Share on WhatsApp');
      const raiz = otra.nativeElement as HTMLElement;
      expect(raiz.querySelector('.share-bar__label')?.textContent?.trim()).toBe('Share');
      expect(raiz.querySelector('.share-bar__action--copy')?.getAttribute('title')).toBe('Copy link');
      expect(c.copyFailedLabel()).toBe('No se pudo copiar el enlace');
    });
  });
});

describe('share-bar pure helpers', () => {
  it('normalizePlatforms cleans CSV, JSON arrays, dedupes and drops unknowns', () => {
    expect(normalizePlatforms('facebook, X , telegram')).toEqual([
      'facebook',
      'x',
      'telegram',
    ]);
    expect(normalizePlatforms(['email', 'email', 'nope'])).toEqual(['email']);
    expect(normalizePlatforms(undefined)).toEqual([]);
  });

  it('buildShareUrl encodes url and title per network', () => {
    const fb = buildShareUrl('facebook', 'https://a.b/c', 'T');
    expect(fb).toContain('facebook.com/sharer');
    expect(fb).toContain(encodeURIComponent('https://a.b/c'));

    const mail = buildShareUrl('email', 'https://a.b/c', 'Asunto');
    expect(mail.startsWith('mailto:')).toBe(true);
    expect(mail).toContain(encodeURIComponent('Asunto'));
  });

  // CMS#192, caso 20: `DTSelectSharePlatform` ofrecía reddit y pinterest, y el elemento los tiraba.
  it('reddit y pinterest viajan, se pintan con su glifo y abren su intento con el destino', () => {
    expect(normalizePlatforms('reddit, pinterest')).toEqual(['reddit', 'pinterest']);

    const reddit = buildShareUrl('reddit', 'https://a.b/c', 'Título');
    expect(reddit).toBe(`https://www.reddit.com/submit?url=${encodeURIComponent('https://a.b/c')}&title=${encodeURIComponent('Título')}`);
    const pinterest = buildShareUrl('pinterest', 'https://a.b/c', 'Título');
    expect(pinterest).toBe(
      `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent('https://a.b/c')}&description=${encodeURIComponent('Título')}`,
    );
  });
});
