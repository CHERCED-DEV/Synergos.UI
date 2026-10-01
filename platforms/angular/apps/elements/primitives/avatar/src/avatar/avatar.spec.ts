import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AVATAR_SYNHOST } from '@synergos/contracts';
import { AvatarElementComponent, deriveInitials } from './avatar';

describe('AvatarElementComponent', () => {
  let fixture: ComponentFixture<AvatarElementComponent>;
  let component: AvatarElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with safe defaults and no image/initials/status (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.showImage()).toBe(false);
    expect(component.initials()).toBe('');
    expect(component.size()).toBe('md');
    expect(component.shape()).toBe('circle');
    expect(component.hasStatus()).toBe(false);
    expect(component.baseLabel()).toBe('Avatar de usuario');
  });

  it('should render initials, size, shape and status from config (render/config case)', async () => {
    fixture.componentRef.setInput('name', 'Ada Lovelace');
    fixture.componentRef.setInput('size', 'lg');
    fixture.componentRef.setInput('shape', 'rounded');
    fixture.componentRef.setInput('status', 'online');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.initials()).toBe('AL');
    expect(component.size()).toBe('lg');
    expect(component.shape()).toBe('rounded');
    expect(component.status()).toBe('online');
    expect(component.hasStatus()).toBe(true);
    expect(component.fullLabel()).toBe('Ada Lovelace — En línea');
    // src absent → initials path, not image.
    expect(component.showImage()).toBe(false);
  });

  it('should fall back to initials when the image errors at runtime (interaction case)', async () => {
    fixture.componentRef.setInput('src', 'https://example.com/broken.png');
    fixture.componentRef.setInput('name', 'Grace Hopper');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.showImage()).toBe(true);

    component.onImageError();
    fixture.detectChanges();

    expect(component.imageErrored()).toBe(true);
    expect(component.showImage()).toBe(false);
    expect(component.initials()).toBe('GH');
  });

  // `size`, `shape`, `name` y `status` no los autora el CMS (ADR 0135): son atributos.
  it('should let direct inputs override config and stay idempotent (precedence case)', async () => {
    fixture.componentRef.setInput('config', '{"src":"/media/config.jpg","alt":"Alt del config"}');
    fixture.componentRef.setInput('alt', 'Alt directo');
    fixture.componentRef.setInput('size', 'xl');
    fixture.componentRef.setInput('shape', 'square');
    fixture.componentRef.setInput('status', 'busy');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.src()).toBe('/media/config.jpg');
    expect(component.baseLabel()).toBe('Alt directo');
    expect(component.size()).toBe('xl');
    expect(component.shape()).toBe('square');
    expect(component.status()).toBe('busy');

    // Re-applying the same inputs yields the same derived state (idempotent).
    const before = {
      size: component.size(),
      shape: component.shape(),
      label: component.fullLabel(),
      status: component.status(),
    };
    fixture.componentRef.setInput('size', 'xl');
    fixture.detectChanges();
    await fixture.whenStable();

    expect({
      size: component.size(),
      shape: component.shape(),
      label: component.fullLabel(),
      status: component.status(),
    }).toEqual(before);
  });

  // D1: con `avatarSrc` —lo que mandaba la vista— este elemento pintaba el icono genérico. Éste
  // alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('muestra la foto que el editor eligió con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = AVATAR_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.showImage()).toBe(true);
    expect(component.src()).toBe(ejemplo.src);
    expect(component.baseLabel()).toBe(ejemplo.alt);
    const img = (fixture.nativeElement as HTMLElement).querySelector('img');
    expect(img?.getAttribute('src')).toBe(ejemplo.src);
  });

  it('should ignore unknown enum values and fall back to defaults', () => {
    fixture.componentRef.setInput('size', 'gigante');
    fixture.componentRef.setInput('shape', 'triangle');
    fixture.componentRef.setInput('status', 'thinking');
    fixture.detectChanges();

    expect(component.size()).toBe('md');
    expect(component.shape()).toBe('circle');
    expect(component.status()).toBe('none');
  });

  // ADR 0136 (CMS#191): la microcopia sale de la sección `Avatar` que publica la página.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO', () => {
      fixture.componentRef.setInput('status', 'busy');
      fixture.detectChanges();

      expect(component.fullLabel()).toBe('Avatar de usuario — Ocupado');
      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('.avatar__status')?.getAttribute('title')).toBe('Ocupado');
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys: { 'Avatar.Fallback': 'User avatar', 'Avatar.Status.Away': 'Away' } },
      };
      const otra = TestBed.createComponent(AvatarElementComponent);
      otra.componentRef.setInput('status', 'away');
      otra.detectChanges();

      const raiz = otra.nativeElement as HTMLElement;
      expect(raiz.querySelector('.avatar')?.getAttribute('aria-label')).toBe('User avatar — Away');
      otra.componentRef.setInput('status', 'offline');
      otra.detectChanges();
      expect(otra.componentInstance.statusLabel()).toBe('Desconectado');
    });
  });
});

describe('deriveInitials', () => {
  it('takes first + last token initials, uppercased', () => {
    expect(deriveInitials('Ada Lovelace')).toBe('AL');
    expect(deriveInitials('  john   ronald   reuel  tolkien ')).toBe('JT');
  });

  it('returns a single initial for single-token names', () => {
    expect(deriveInitials('Cher')).toBe('C');
  });

  it('returns empty string for empty or whitespace input', () => {
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials('   ')).toBe('');
    expect(deriveInitials(undefined)).toBe('');
  });
});
