import { TestBed } from '@angular/core/testing';
import { OverviewCardComponent } from './overview-card';

describe(OverviewCardComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverviewCardComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(OverviewCardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders heading, status and details', () => {
    const fixture = TestBed.createComponent(OverviewCardComponent);
    fixture.componentRef.setInput('title', 'Booking overview');
    fixture.componentRef.setInput('statusLabel', 'Confirmed');
    fixture.componentRef.setInput('details', [
      { term: 'Reference', description: 'AB-123' },
      { term: 'Guests', description: '2' },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Booking overview');
    expect(fixture.nativeElement.textContent).toContain('Confirmed');
    expect(fixture.nativeElement.textContent).toContain('AB-123');
  });
});
