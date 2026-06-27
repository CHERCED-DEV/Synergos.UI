import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvatarUploadElementComponent } from './avatar-upload';

function pngFile(name = 'avatar.png', size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type: 'image/png' });
  return new File([blob], name, { type: 'image/png' });
}

function fileChangeEvent(file: File | null): Event {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', {
    value: file ? [file] : [],
    configurable: true,
  });
  return { target: input } as unknown as Event;
}

describe('AvatarUploadElementComponent', () => {
  let fixture: ComponentFixture<AvatarUploadElementComponent>;
  let component: AvatarUploadElementComponent;

  beforeEach(async () => {
    // jsdom lacks object-URL helpers; stub so previews resolve deterministically.
    if (typeof URL.createObjectURL !== 'function') {
      (URL as unknown as { createObjectURL: () => string }).createObjectURL = () =>
        'blob:avatar';
      (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
    }

    await TestBed.configureTestingModule({
      imports: [AvatarUploadElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarUploadElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create idle with no preview and defaults (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.status()).toBe('idle');
    expect(component.hasPreview()).toBe(false);
    expect(component.canUpload()).toBe(false);
    expect(component.label()).toBe('Foto de perfil');
  });

  it('should resolve config and let attributes override it (render + config case)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Config label","maxSizeKb":500}');
    fixture.componentRef.setInput('label', 'Sube tu logo');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Sube tu logo');
    expect(component.maxSizeKb()).toBe(500);
    expect(component.maxSizeLabel()).toBe('500 KB');
  });

  it('should accept a dropped image, preview it and arm upload (interaction case)', () => {
    component.onFileChange(fileChangeEvent(pngFile()));

    expect(component.status()).toBe('selected');
    expect(component.hasPreview()).toBe(true);
    expect(component.fileName()).toBe('avatar.png');
    expect(component.canUpload()).toBe(true);
  });

  it('should reject a file over the configured size limit', () => {
    fixture.componentRef.setInput('maxSizeKb', 1);
    fixture.detectChanges();

    component.onFileChange(fileChangeEvent(pngFile('big.png', 4096)));

    expect(component.status()).toBe('error');
    expect(component.message()).toContain('tamaño máximo');
    expect(component.canUpload()).toBe(false);
  });

  it('should reset to a clean idle state on remove (idempotent case)', () => {
    component.onFileChange(fileChangeEvent(pngFile()));
    expect(component.status()).toBe('selected');

    component.remove();
    const first = {
      status: component.status(),
      hasPreview: component.hasPreview(),
      fileName: component.fileName(),
      canUpload: component.canUpload(),
    };

    // Removing again is a no-op — state stays identical.
    component.remove();
    const second = {
      status: component.status(),
      hasPreview: component.hasPreview(),
      fileName: component.fileName(),
      canUpload: component.canUpload(),
    };

    expect(first).toEqual({ status: 'idle', hasPreview: false, fileName: '', canUpload: false });
    expect(second).toEqual(first);
  });
});
