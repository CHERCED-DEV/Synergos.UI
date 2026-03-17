import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestMacroComponent } from './test-macro';

describe('TestMacroComponent', () => {
  let fixture: ComponentFixture<TestMacroComponent>;
  let component: TestMacroComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestMacroComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TestMacroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render title when provided', async () => {
    fixture.componentRef.setInput('title', 'Hello Macro');
    fixture.detectChanges();
    await fixture.whenStable();

    const h2 = fixture.nativeElement.querySelector('.macro-title');
    expect(h2?.textContent?.trim()).toBe('Hello Macro');
  });

  it('should render userId when provided', async () => {
    fixture.componentRef.setInput('userId', 'usr-42');
    fixture.detectChanges();
    await fixture.whenStable();

    const meta = fixture.nativeElement.querySelector('.macro-meta');
    expect(meta?.textContent).toContain('usr-42');
  });

  it('should update text signal and emit textChanged on input event', () => {
    const emitted: string[] = [];
    const sub = component.textChanged.subscribe((v) => emitted.push(v));

    const input: HTMLInputElement = fixture.nativeElement.querySelector('.macro-input');
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.text()).toBe('hello');
    expect(component.uppercaseText()).toBe('HELLO');
    expect(emitted).toEqual(['hello']);

    sub.unsubscribe();
  });
});
