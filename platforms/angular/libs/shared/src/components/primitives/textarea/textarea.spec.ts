import { TestBed } from '@angular/core/testing';
import { TextareaComponent } from './textarea';

describe(TextareaComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextareaComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(TextareaComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits value changes', () => {
    const fixture = TestBed.createComponent(TextareaComponent);
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();

    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Design System';
    textarea.dispatchEvent(new Event('input'));

    expect(changed).toHaveBeenCalledWith('Design System');
  });

  it('applies invalid state and renders hint content', () => {
    const fixture = TestBed.createComponent(TextareaComponent);
    fixture.componentRef.setInput('hint', 'Add details');
    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    const wrapper = fixture.nativeElement.querySelector('.syn-textarea') as HTMLDivElement;
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const hint = fixture.nativeElement.querySelector('.syn-textarea__hint') as HTMLParagraphElement;

    expect(wrapper.className).toContain('syn-textarea--error');
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(textarea.getAttribute('aria-describedby')).toContain(hint.id);
    expect(hint.textContent).toContain('Add details');
  });
});
