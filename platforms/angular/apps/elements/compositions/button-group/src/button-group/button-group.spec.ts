import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ButtonGroupComponent,
  normalizeButtonGroupItems,
  sanitizeButtonGroupConfig,
} from './button-group';

describe('ButtonGroupComponent', () => {
  let fixture: ComponentFixture<ButtonGroupComponent>;
  let component: ButtonGroupComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonGroupComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonGroupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should normalize button definitions from JSON', async () => {
    fixture.componentRef.setInput(
      'buttons',
      '[{"label":"Primary","variant":"outline","size":"lg","href":"https://example.com"}]',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedButtons()).toEqual([
      {
        label: 'Primary',
        variant: 'outline',
        size: 'lg',
        href: 'https://example.com',
        target: '_self',
        disabled: false,
      },
    ]);
  });

  it('should read button collections from config when no legacy json input is provided', async () => {
    fixture.componentRef.setInput('config', {
      buttons: [
        {
          label: 'Config Primary',
          variant: 'ghost',
          size: 'sm',
          href: '/config',
          target: '_self',
          disabled: false,
        },
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedButtons()).toEqual([
      {
        label: 'Config Primary',
        variant: 'ghost',
        size: 'sm',
        href: '/config',
        target: '_self',
        disabled: false,
      },
    ]);
  });

  it('should sanitize legacy config.buttons and normalize group settings', () => {
    const config = sanitizeButtonGroupConfig({
      alignment: 'right',
      direction: 'column',
      gap: 'lg',
      buttons: [
        { label: 'Config CTA', variant: 'ghost', size: 'sm', href: '/cta' },
        { label: '', href: '/broken' },
      ],
    } as unknown as Record<string, unknown>);

    expect(config.alignment).toBe('right');
    expect(config.direction).toBe('column');
    expect(config.gap).toBe('lg');
    expect(normalizeButtonGroupItems(config.items)).toEqual([
      {
        label: 'Config CTA',
        variant: 'ghost',
        size: 'sm',
        href: '/cta',
        target: '_self',
        disabled: false,
      },
    ]);
  });

  it('should filter malformed button definitions', () => {
    expect(
      normalizeButtonGroupItems([
        { label: 'Primary', variant: 'outline', size: 'lg' },
        { label: '' },
        { href: '/missing-label' },
      ]),
    ).toEqual([
      {
        label: 'Primary',
        variant: 'outline',
        size: 'lg',
        href: '',
        target: '_self',
        disabled: false,
      },
    ]);
  });
});
