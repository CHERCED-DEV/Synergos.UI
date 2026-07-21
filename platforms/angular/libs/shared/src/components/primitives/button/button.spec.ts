import { TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button';

describe(ButtonComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ButtonComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits pressed when clicked', () => {
    const fixture = TestBed.createComponent(ButtonComponent);
    const pressed = vi.fn();
    fixture.componentInstance.pressed.subscribe(pressed);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();

    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('resolves base values from config and lets direct inputs override them', () => {
    const fixture = TestBed.createComponent(ButtonComponent);

    fixture.componentRef.setInput('config', {
      label: 'Save changes',
      variant: 'outline',
      disabled: true,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.label()).toBe('Save changes');
    expect(fixture.componentInstance.variant()).toBe('outline');
    expect(fixture.componentInstance.disabled()).toBe(true);

    fixture.componentRef.setInput('label', 'Save now');
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();

    expect(fixture.componentInstance.label()).toBe('Save now');
    expect(fixture.componentInstance.disabled()).toBe(false);
  });

  describe('loading state', () => {
    function createLoadingFixture() {
      const fixture = TestBed.createComponent(ButtonComponent);
      fixture.componentRef.setInput('label', 'Save');
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      return fixture;
    }

    it('resolves loading from config and lets the direct input override it', () => {
      const fixture = TestBed.createComponent(ButtonComponent);

      fixture.componentRef.setInput('config', { loading: true, loadingLabel: 'Saving' });
      fixture.detectChanges();

      expect(fixture.componentInstance.loading()).toBe(true);
      expect(fixture.componentInstance.loadingLabel()).toBe('Saving');

      fixture.componentRef.setInput('loading', false);
      fixture.detectChanges();

      expect(fixture.componentInstance.loading()).toBe(false);
    });

    it('defaults to not loading, with the shared default loading label', () => {
      const fixture = TestBed.createComponent(ButtonComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.componentInstance.loadingLabel()).toBe('Loading');
    });

    it('blocks the press with aria-disabled instead of the native disabled attribute', () => {
      const fixture = createLoadingFixture();
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

      // The whole point: a native `disabled` button loses focus and leaves the tab
      // order, so a keyboard press would drop the user on <body> mid-operation.
      expect(button.disabled).toBe(false);
      expect(button.hasAttribute('disabled')).toBe(false);
      expect(button.getAttribute('aria-disabled')).toBe('true');
    });

    it('does not emit pressed while loading, and stops the click from bubbling', () => {
      const fixture = createLoadingFixture();
      const pressed = vi.fn();
      const ancestorHandler = vi.fn();
      fixture.componentInstance.pressed.subscribe(pressed);
      fixture.nativeElement.addEventListener('click', ancestorHandler);

      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      button.click();

      expect(pressed).not.toHaveBeenCalled();
      expect(ancestorHandler).not.toHaveBeenCalled();
    });

    it('emits pressed again once loading clears', () => {
      const fixture = createLoadingFixture();
      const pressed = vi.fn();
      fixture.componentInstance.pressed.subscribe(pressed);

      fixture.componentRef.setInput('loading', false);
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

      expect(pressed).toHaveBeenCalledTimes(1);
    });

    it('marks the button busy while loading and clears it afterwards', () => {
      const fixture = createLoadingFixture();
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.classList.contains('syn-button--loading')).toBe(true);

      fixture.componentRef.setInput('loading', false);
      fixture.detectChanges();

      expect(button.hasAttribute('aria-busy')).toBe(false);
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      expect(button.classList.contains('syn-button--loading')).toBe(false);
    });

    it('announces the loading label through a live region that exists before it fills', () => {
      const fixture = TestBed.createComponent(ButtonComponent);
      fixture.componentRef.setInput('label', 'Save');
      fixture.detectChanges();

      // A live region created at the same time as its content is routinely missed by
      // screen readers, so it must already be in the DOM (and empty) at rest.
      const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
      expect(status).toBeTruthy();
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.textContent?.trim()).toBe('');

      fixture.componentRef.setInput('loading', true);
      fixture.componentRef.setInput('loadingLabel', 'Saving');
      fixture.detectChanges();

      expect(status.textContent?.trim()).toBe('Saving');
    });

    it('keeps the live region outside the button so it cannot pollute the accessible name', () => {
      const fixture = createLoadingFixture();
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

      expect(button.querySelector('[role="status"]')).toBeNull();
    });

    it('renders a reduced-motion text fallback that is hidden from screen readers', () => {
      const fixture = createLoadingFixture();

      // The spinner is pure decoration and the CSS swaps it for this text under
      // prefers-reduced-motion; the announcement is the live region's job, so this
      // node must not be read too (nor join the button's accessible name).
      const busyText = fixture.nativeElement.querySelector('.syn-button__busy-text') as HTMLElement;
      expect(busyText).toBeTruthy();
      expect(busyText.textContent?.trim()).toBe('Loading');
      expect(busyText.getAttribute('aria-hidden')).toBe('true');
    });

    it('keeps the label in the layout so the button cannot resize when loading starts', () => {
      const fixture = createLoadingFixture();

      // The label is dimmed with opacity in CSS, never removed: it both reserves the
      // width and keeps the accessible name alive.
      const label = fixture.nativeElement.querySelector('.syn-button__label') as HTMLElement;
      expect(label).toBeTruthy();
      expect(label.textContent?.trim()).toBe('Save');
    });
  });
});
