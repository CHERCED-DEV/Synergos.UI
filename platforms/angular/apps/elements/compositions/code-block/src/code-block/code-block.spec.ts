import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CodeBlockElementComponent,
  type CodeCopyDetail,
  splitCodeLines,
} from './code-block';

const SAMPLE = 'const a = 1;\nconst b = 2;\nreturn a + b;';

describe('CodeBlockElementComponent', () => {
  let fixture: ComponentFixture<CodeBlockElementComponent>;
  let component: CodeBlockElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodeBlockElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CodeBlockElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no code and report the empty state (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasCode()).toBe(false);
    expect(component.lineCount()).toBe(0);
    expect(component.lines().length).toBe(0);
    expect(component.copyButtonLabel()).toBe('Copiar');
  });

  it('should split code into numbered lines and read config (render/config case)', async () => {
    fixture.componentRef.setInput('code', SAMPLE);
    fixture.componentRef.setInput('language', 'ts');
    fixture.componentRef.setInput('filename', 'demo.ts');
    fixture.componentRef.setInput('showLineNumbers', 'true');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasCode()).toBe(true);
    expect(component.lineCount()).toBe(3);
    expect(component.lines()[0]).toEqual({ number: 1, text: 'const a = 1;' });
    expect(component.lines()[2]).toEqual({ number: 3, text: 'return a + b;' });
    expect(component.language()).toBe('ts');
    expect(component.filename()).toBe('demo.ts');
    expect(component.showLineNumbers()).toBe(true);
  });

  it('should copy code and emit codecopy with the copied text (interaction case)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    fixture.componentRef.setInput('code', SAMPLE);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: CodeCopyDetail | undefined;
    component.codecopy.subscribe((detail) => (emitted = detail));

    await component.copy();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(SAMPLE);
    expect(emitted?.success).toBe(true);
    expect(emitted?.code).toBe(SAMPLE);
    expect(component.copied()).toBe(true);
    expect(component.copyButtonLabel()).toBe('Copiado');
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"language":"json","copyLabel":"Copy","showLineNumbers":true}',
    );
    fixture.componentRef.setInput('language', 'yaml');
    fixture.detectChanges();
    await fixture.whenStable();

    // Direct input wins over config; unset inputs fall back to config.
    expect(component.language()).toBe('yaml');
    expect(component.copyLabel()).toBe('Copy');
    expect(component.showLineNumbers()).toBe(true);

    // Re-resolving with the same inputs yields the same result (idempotent).
    fixture.detectChanges();
    expect(component.language()).toBe('yaml');
    expect(component.copyLabel()).toBe('Copy');
  });
});

describe('code-block pure helpers', () => {
  it('splitCodeLines returns nothing for empty input', () => {
    expect(splitCodeLines('').length).toBe(0);
    expect(splitCodeLines(undefined).length).toBe(0);
  });

  it('splitCodeLines normalizes CRLF and trims surrounding blank lines', () => {
    const lines = splitCodeLines('\r\nuno\r\ndos\r\n\r\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toEqual({ number: 1, text: 'uno' });
    expect(lines[1]).toEqual({ number: 2, text: 'dos' });
  });

  it('splitCodeLines preserves interior blank lines', () => {
    const lines = splitCodeLines('a\n\nb');
    expect(lines.length).toBe(3);
    expect(lines[1].text).toBe('');
  });
});
