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
});