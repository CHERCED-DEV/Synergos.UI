import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ICON_LABEL_SYNHOST } from '@synergos/contracts';
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

  // `iconSymbol`, `tone` y `gap` no los autora el editor en el CMS (ADR 0135): son atributo.
  it('should render icon + label and resolve config + tone/gap (render/config case)', async () => {
    fixture.componentRef.setInput('config', '{"labelText":"Destacado"}');
    fixture.componentRef.setInput('iconSymbol', '★');
    fixture.componentRef.setInput('tone', 'brand');
    fixture.componentRef.setInput('gap', 'lg');
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

  // D1: con `iconKey` —lo que mandaba la vista— este elemento pintaba el texto sin el icono.
  // Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta el icono y el texto que el editor autoró con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = ICON_LABEL_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.iconName()).toBe(ejemplo.iconName);
    expect(component.labelText()).toBe(ejemplo.labelText);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('syn-icon')).not.toBeNull();
    expect(root.querySelector('.icon-label__text')?.textContent?.trim()).toBe(ejemplo.labelText);
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
    // `href` y `target` no los autora el editor en el CMS (ADR 0135): son atributo.
    fixture.componentRef.setInput('config', '{"labelText":"Desde config"}');
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
