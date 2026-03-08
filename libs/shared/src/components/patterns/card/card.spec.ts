import { TestBed } from '@angular/core/testing';
import { CardComponent } from './card';

describe(CardComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(CardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits selected when interactive and clicked', () => {
    const fixture = TestBed.createComponent(CardComponent);
    fixture.componentRef.setInput('interactive', true);

    const selected = vi.fn();
    fixture.componentInstance.selected.subscribe(selected);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('article') as HTMLElement;
    card.click();

    expect(selected).toHaveBeenCalledTimes(1);
  });
});