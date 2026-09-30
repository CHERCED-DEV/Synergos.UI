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

  it('names the radiogroup and keeps EXACTLY one radio in the tab order: the checked one', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', LAYOUTS);
    fixture.componentRef.setInput('ariaLabel', 'Vista de resultados');
    fixture.componentRef.setInput('value', 'split');
    fixture.detectChanges();

    const group = fixture.nativeElement.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute('aria-label')).toBe('Vista de resultados');

    const radios = Array.from(
      fixture.nativeElement.querySelectorAll('[role="radio"]'),
    ) as HTMLButtonElement[];
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('follows the parent-fed `value`, and never lands on a disabled or unknown one', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', [
      { value: 'list', label: 'Lista', disabled: true },
      { value: 'split', label: 'Dividido' },
      { value: 'map', label: 'Mapa' },
    ]);
    fixture.componentRef.setInput('value', 'map');
    fixture.detectChanges();

    const checked = (): string | null =>
      (fixture.nativeElement.querySelector('[aria-checked="true"]') as HTMLElement | null)?.textContent?.trim() ??
      null;
    expect(checked()).toBe('Mapa');

    // A disabled value is not honoured: the first ENABLED option is checked instead.
    fixture.componentRef.setInput('value', 'list');
    fixture.detectChanges();
    expect(checked()).toBe('Dividido');

    fixture.componentRef.setInput('value', 'no-existe');
    fixture.detectChanges();
    expect(checked()).toBe('Dividido');
  });

  it('ArrowLeft on the first radio wraps to the last one', () => {
    Element.prototype.scrollIntoView = vi.fn();

    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', LAYOUTS);
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    const first = radios[0] as HTMLButtonElement;
    const last = radios[2] as HTMLButtonElement;

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(last);
    expect(last.getAttribute('aria-checked')).toBe('true');
    expect(changed).toHaveBeenCalledWith('map');

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('Space and Enter select the focused radio', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', LAYOUTS);
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    const second = radios[1] as HTMLButtonElement;
    const third = radios[2] as HTMLButtonElement;

    second.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.detectChanges();
    expect(second.getAttribute('aria-checked')).toBe('true');

    third.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(third.getAttribute('aria-checked')).toBe('true');
    expect(changed.mock.calls).toEqual([['split'], ['map']]);
  });

  it('renders an option badge INSIDE its radio, so it is part of the accessible name', () => {
    const fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('options', [
      { value: 'all', label: 'Todos' },
      { value: 'result', label: 'Resultados', badge: '3' },
    ]);
    fixture.detectChanges();

    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    expect((radios[0] as HTMLElement).querySelector('syn-badge')).toBeNull();

    const badge = (radios[1] as HTMLElement).querySelector('syn-badge') as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.trim()).toBe('3');
    expect((radios[1] as HTMLElement).textContent?.replace(/\s+/g, ' ').trim()).toBe('Resultados 3');
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
