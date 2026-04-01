import { TestBed } from '@angular/core/testing';
import { PricingCardComponent } from './pricing-card';

describe(PricingCardComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PricingCardComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(PricingCardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the price and emits the action', () => {
    const fixture = TestBed.createComponent(PricingCardComponent);
    let actionCount = 0;

    fixture.componentInstance.action.subscribe(() => {
      actionCount += 1;
    });

    fixture.componentRef.setInput('title', 'Starter');
    fixture.componentRef.setInput('amount', 120);
    fixture.componentRef.setInput('currency', 'USD');
    fixture.componentRef.setInput('actionLabel', 'Choose plan');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-button') as HTMLButtonElement;
    button.click();

    expect(fixture.nativeElement.textContent).toContain('Starter');
    expect(fixture.nativeElement.textContent).toContain('120');
    expect(fixture.nativeElement.textContent).toContain('USD');
    expect(actionCount).toBe(1);
  });
});
