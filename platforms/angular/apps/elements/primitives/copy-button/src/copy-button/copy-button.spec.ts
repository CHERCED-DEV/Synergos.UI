import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CopyButtonElementComponent, type CopyButtonCopyDetail } from './copy-button';

describe('CopyButtonElementComponent', () => {
  let fixture: ComponentFixture<CopyButtonElementComponent>;
  let component: CopyButtonElementComponent;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await TestBed.configureTestingModule({
      imports: [CopyButtonElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CopyButtonElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should create with no text, defaults, and be disabled (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.copyText()).toBe('');
    expect(component.disabled()).toBe(true);
    expect(component.buttonLabel()).toBe('Copiar');
    expect(component.liveMessage()).toBe('');
    expect(component.state()).toBe('idle');
  });

  it('should resolve labels and text from config (render + config case)', () => {
    fixture.componentRef.setInput(
      'config',
      '{"copyText":"SAVE20","buttonLabel":"Copiar cupón","feedbackLabel":"¡Listo!"}',
    );
    fixture.detectChanges();

    expect(component.copyText()).toBe('SAVE20');
    expect(component.currentLabel()).toBe('Copiar cupón');
    expect(component.feedbackLabel()).toBe('¡Listo!');
    expect(component.disabled()).toBe(false);
  });

  it('should copy text and announce feedback via aria-live (interaction case)', async () => {
    const emitted: CopyButtonCopyDetail[] = [];
    component.syncopy.subscribe((detail) => emitted.push(detail));

    fixture.componentRef.setInput('copyText', 'hola@synergos.co');
    fixture.detectChanges();

    await component.copy();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('hola@synergos.co');
    expect(component.isCopied()).toBe(true);
    expect(component.liveMessage()).toBe('Copiado');
    expect(emitted).toEqual([{ text: 'hola@synergos.co', success: true }]);
  });

  it('should be a no-op when there is nothing to copy (idempotent case)', async () => {
    const emitted: CopyButtonCopyDetail[] = [];
    component.syncopy.subscribe((detail) => emitted.push(detail));

    await component.copy();
    await component.copy();
    fixture.detectChanges();

    expect(writeText).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
    expect(emitted).toEqual([]);
  });

  it('should let direct inputs override config (input precedence)', () => {
    fixture.componentRef.setInput('config', '{"buttonLabel":"Config"}');
    fixture.componentRef.setInput('buttonLabel', 'Input');
    fixture.detectChanges();

    expect(component.buttonLabel()).toBe('Input');
  });
});
