import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should let direct inputs override config and stay idempotent (precedence case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"size":"xs","shape":"square","name":"Config Name","status":"busy"}',
    );
    fixture.componentRef.setInput('size', 'xl');
    fixture.componentRef.setInput('name', 'Direct Name');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.size()).toBe('xl');
    expect(component.name()).toBe('Direct Name');
    expect(component.shape()).toBe('square');
    expect(component.status()).toBe('busy');

    // Re-applying the same inputs yields the same derived state (idempotent).
    const before = {
      size: component.size(),
      shape: component.shape(),
      initials: component.initials(),
      status: component.status(),
    };
    fixture.componentRef.setInput('size', 'xl');
    fixture.detectChanges();
    await fixture.whenStable();

    expect({
      size: component.size(),
      shape: component.shape(),
      initials: component.initials(),
      status: component.status(),
    }).toEqual(before);
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
