import { TestBed } from '@angular/core/testing';
import { BadgeComponent } from './badge';

describe(BadgeComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BadgeComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders badge text', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.componentRef.setInput('text', 'Beta');
    fixture.detectChanges();

    const span = fixture.nativeElement.querySelector('span') as HTMLSpanElement;
    expect(span.textContent?.trim()).toBe('Beta');
  });
});