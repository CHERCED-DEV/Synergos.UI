import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ButtonGroupComponent } from './button-group';

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
});
