import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      '{"platforms":"facebook","shareTitle":"Desde config"}',
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
});
