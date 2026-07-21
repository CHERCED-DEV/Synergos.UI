import { TestBed } from '@angular/core/testing';
import { SegmentedComponent } from './segmented';

const LAYOUTS = [
  { value: 'list', label: 'Lista' },
  { value: 'split', label: 'Dividido' },
  { value: 'map', label: 'Mapa' },
];

describe(SegmentedComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SegmentedComponent],
    }).compileComponents();
  });

  it('renders no radios when there are no options', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(0);
    const group = fixture.nativeElement.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group).toBeTruthy();
  });

  it('renders options and selects one on click', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', LAYOUTS);

    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(3);
    // Defaults to the first enabled option.
    expect(radios[0].getAttribute('aria-checked')).toBe('true');

    const mapRadio = radios[2] as HTMLButtonElement;
    mapRadio.click();
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledWith('map');
    expect(mapRadio.getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
  });

  it('ArrowRight moves focus AND selection to the destination radio (wrapping)', () => {
    // jsdom does not implement scrollIntoView — stub it so the roving focus path runs.
    Element.prototype.scrollIntoView = vi.fn();

    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', LAYOUTS);

    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    const first = radios[0] as HTMLButtonElement;
    const second = radios[1] as HTMLButtonElement;

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    // Focus follows the roving tabindex; selection moves with it.
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-checked')).toBe('true');
    expect(second.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('aria-checked')).toBe('false');
    expect(first.getAttribute('tabindex')).toBe('-1');
    expect(changed).toHaveBeenCalledWith('split');

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('Home/End jump to the first/last option', () => {
    Element.prototype.scrollIntoView = vi.fn();

    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', LAYOUTS);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    const first = radios[0] as HTMLButtonElement;
    const last = radios[2] as HTMLButtonElement;

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(last);
    expect(last.getAttribute('aria-checked')).toBe('true');

    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(first);
    expect(first.getAttribute('aria-checked')).toBe('true');

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('skips disabled options when navigating with the keyboard', () => {
    Element.prototype.scrollIntoView = vi.fn();

    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', [
      { value: 'list', label: 'Lista' },
      { value: 'split', label: 'Dividido', disabled: true },
      { value: 'map', label: 'Mapa' },
    ]);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    const first = radios[0] as HTMLButtonElement;
    const third = radios[2] as HTMLButtonElement;

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    // 'split' is disabled → focus and selection jump straight to 'map'.
    expect(document.activeElement).toBe(third);
    expect(third.getAttribute('aria-checked')).toBe('true');

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('does not re-emit when re-selecting the already active option (idempotent)', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', LAYOUTS);

    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    const firstActive = radios[0] as HTMLButtonElement;

    // 'list' is already the default selection → clicking it must not emit.
    firstActive.click();
    fixture.detectChanges();
    expect(changed).not.toHaveBeenCalled();

    // Select a different one → one emit; re-select it → still one emit.
    const mapRadio = radios[2] as HTMLButtonElement;
    mapRadio.click();
    mapRadio.click();
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith('map');
  });
});
