import { TestBed } from '@angular/core/testing';
import { OptionGroupComponent } from './option-group';

describe(OptionGroupComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OptionGroupComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(OptionGroupComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits the selected item for card variants', () => {
    const fixture = TestBed.createComponent(OptionGroupComponent);
    let emittedTitle = '';

    fixture.componentInstance.itemActivated.subscribe((item) => {
      emittedTitle = item.title;
    });

    fixture.componentRef.setInput('items', [
      {
        id: 'priority',
        title: 'Priority support',
        description: 'Move urgent requests to the front.',
      },
    ]);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '.syn-option-group__entry--action',
    ) as HTMLButtonElement;
    button.click();

    expect(emittedTitle).toBe('Priority support');
  });
});
