import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScriptService } from '@synergos/core';
import { ScriptEmbedElementComponent } from './script-embed';

describe('ScriptEmbedElementComponent', () => {
  let fixture: ComponentFixture<ScriptEmbedElementComponent>;
  let component: ScriptEmbedElementComponent;
  const addScript = vi.fn();

  beforeEach(async () => {
    addScript.mockReset();

    await TestBed.configureTestingModule({
      imports: [ScriptEmbedElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ScriptService,
          useValue: { addScript },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScriptEmbedElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should add a script from config', async () => {
    fixture.componentRef.setInput('config', '{"scriptType":"module","content":"https://cdn.example.com/widget.js"}');
    fixture.componentRef.setInput('target', 'head');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(addScript).toHaveBeenCalledWith(
      expect.objectContaining({
        src: 'https://cdn.example.com/widget.js',
        attributes: [{ name: 'type', value: 'module' }],
        target: 'head',
      }),
    );
  });

  it('should support inline script bodies', async () => {
    fixture.componentRef.setInput('inlineScript', 'window.__widget = true;');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(addScript).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'window.__widget = true;',
      }),
    );
  });
});
