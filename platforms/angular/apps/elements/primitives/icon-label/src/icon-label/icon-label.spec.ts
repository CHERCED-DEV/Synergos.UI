import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  IconLabelElementComponent,
  type IconLabelActivateDetail,
} from './icon-label';

describe('IconLabelElementComponent', () => {
  let fixture: ComponentFixture<IconLabelElementComponent>;
  let component: IconLabelElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconLabelElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(IconLabelElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render nothing when no icon or label is set (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.isEmpty()).toBe(true);
    expect(component.hasIcon()).toBe(false);
    expect(component.hasLabel()).toBe(false);
    expect(component.mode()).toBe('static');
    // No wrapper element is rendered for an empty primitive.
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.icon-label')).toBeNull();
  });

  it('should render icon + label and resolve config + tone/gap (render/config case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"iconSymbol":"★","labelText":"Destacado","tone":"brand","gap":"lg"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isEmpty()).toBe(false);
    expect(component.hasIcon()).toBe(true);
    expect(component.hasLabel()).toBe(true);
    expect(component.iconSymbol()).toBe('★');
    expect(component.labelText()).toBe('Destacado');
    expect(component.tone()).toBe('brand');
    expect(component.gap()).toBe('lg');
    expect(component.rootClass()).toContain('icon-label--brand');
    expect(component.rootClass()).toContain('icon-label--gap-lg');

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('span.icon-label')).not.toBeNull();
    expect(root.querySelector('.icon-label__text')?.textContent?.trim()).toBe('Destacado');
    expect(root.querySelector('syn-icon')).not.toBeNull();
  });

  it('should switch to action mode and emit iconlabelactivate on activate (interaction case)', async () => {
    fixture.componentRef.setInput('labelText', 'Filtrar');
    fixture.componentRef.setInput('iconName', 'filter');
    fixture.componentRef.setInput('interactive', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.mode()).toBe('action');
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>('button.icon-label');
    expect(button).not.toBeNull();

    let emitted: IconLabelActivateDetail | undefined;
    component.iconlabelactivate.subscribe((detail) => (emitted = detail));
    button!.click();

    expect(emitted?.label).toBe('Filtrar');
  });

  it('should let direct inputs override config and render a hardened link (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"labelText":"Desde config","href":"https://config.example","target":"_self"}',
    );
    fixture.componentRef.setInput('labelText', 'Desde input');
    fixture.componentRef.setInput('href', 'https://input.example');
    fixture.componentRef.setInput('target', '_blank');
    fixture.detectChanges();
    await fixture.whenStable();

    // Direct attributes win over config.
    expect(component.labelText()).toBe('Desde input');
    expect(component.href()).toBe('https://input.example');
    expect(component.mode()).toBe('link');
    expect(component.linkRel()).toBe('noopener noreferrer');

    const root = fixture.nativeElement as HTMLElement;
    const anchor = root.querySelector<HTMLAnchorElement>('a.icon-label');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('href')).toBe('https://input.example');
    expect(anchor!.getAttribute('rel')).toBe('noopener noreferrer');

    // Idempotent: re-reading the same resolved values is stable.
    expect(component.labelText()).toBe('Desde input');
    expect(component.mode()).toBe('link');
  });
});
