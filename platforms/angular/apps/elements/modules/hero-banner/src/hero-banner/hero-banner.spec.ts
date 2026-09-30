import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HERO_BANNER_SYNHOST } from '@synergos/contracts';
import { HeroBannerElementComponent, type HeroBannerCtaDetail } from './hero-banner';

describe('HeroBannerElementComponent', () => {
  let fixture: ComponentFixture<HeroBannerElementComponent>;
  let component: HeroBannerElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroBannerElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HeroBannerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no content and a light surface tone (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasContent()).toBe(false);
    expect(component.hasMedia()).toBe(false);
    expect(component.hasCta()).toBe(false);
    // No image → fall back to the light surface tone.
    expect(component.resolvedTone()).toBe('light');
    expect(component.ctaTone()).toBe('brand');
  });

  it('should render title/subtitle/CTA and darken for an image (render/config case)', async () => {
    fixture.componentRef.setInput('media', 'https://cdn.example.com/hero.jpg');
    fixture.componentRef.setInput('mediaAlt', 'Equipo trabajando');
    fixture.componentRef.setInput('eyebrow', 'Synergos');
    fixture.componentRef.setInput('title', 'Construido para crecer');
    fixture.componentRef.setInput('subtitle', 'Una plataforma componible.');
    fixture.componentRef.setInput('ctaLabel', 'Empezar');
    fixture.componentRef.setInput('ctaLink', '/registro');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasMedia()).toBe(true);
    expect(component.hasContent()).toBe(true);
    expect(component.hasCta()).toBe(true);
    expect(component.imageDecorative()).toBe(false);
    // auto tone + image → dark scrim, inverse CTA.
    expect(component.resolvedTone()).toBe('dark');
    expect(component.ctaTone()).toBe('inverse');

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.hero__title')?.textContent).toContain('Construido para crecer');
    expect(root.querySelector('.hero__media')?.getAttribute('alt')).toBe('Equipo trabajando');
  });

  it('should emit ctaactivate with href + label when the CTA fires (interaction case)', async () => {
    fixture.componentRef.setInput('title', 'Hola');
    fixture.componentRef.setInput('ctaLabel', 'Reservar');
    fixture.componentRef.setInput('ctaLink', 'https://example.com/reservar');
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: HeroBannerCtaDetail | undefined;
    component.ctaactivate.subscribe((detail) => (emitted = detail));

    component.onCtaActivate();

    expect(emitted).toEqual({ href: 'https://example.com/reservar', label: 'Reservar' });
  });

  it('should not emit when the CTA is incomplete (no-op guard)', async () => {
    fixture.componentRef.setInput('ctaLabel', 'Solo label, sin link');
    fixture.detectChanges();
    await fixture.whenStable();

    let emittedCount = 0;
    component.ctaactivate.subscribe(() => (emittedCount += 1));

    component.onCtaActivate();

    expect(component.hasCta()).toBe(false);
    expect(emittedCount).toBe(0);
  });

  // `tone` y `align` no los autora el CMS (ADR 0135): son atributos, no viajan en `config`.
  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"title":"Config title","subtitle":"Config subtitle"}');
    fixture.componentRef.setInput('title', 'Input title');
    fixture.componentRef.setInput('tone', 'light');
    fixture.componentRef.setInput('align', 'center');
    fixture.detectChanges();
    await fixture.whenStable();

    // Direct input wins; untouched config fields still apply.
    expect(component.title()).toBe('Input title');
    expect(component.subtitle()).toBe('Config subtitle');
    expect(component.tone()).toBe('light');
    expect(component.align()).toBe('center');
    expect(component.resolvedTone()).toBe('light');
  });

  // D1: con `mediaUrl`/`ctaUrl` —lo que mandaba la vista— el hero perdía al hidratar la foto y
  // el botón que el SSR pintaba. Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta la foto y el botón que el editor autoró con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = HERO_BANNER_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasMedia()).toBe(true);
    expect(component.media()).toBe(ejemplo.media);
    expect(component.imageAlt()).toBe(ejemplo.mediaAlt);
    expect(component.hasCta()).toBe(true);
    expect(component.ctaLink()).toBe(ejemplo.ctaLink);
    expect(component.ctaLabel()).toBe(ejemplo.ctaLabel);
    const img = (fixture.nativeElement as HTMLElement).querySelector('img.hero__media');
    expect(img?.getAttribute('src')).toBe(ejemplo.media);
  });
});
