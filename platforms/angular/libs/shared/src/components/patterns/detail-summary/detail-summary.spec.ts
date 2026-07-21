import { TestBed } from '@angular/core/testing';
import { DetailSummaryComponent } from './detail-summary';

describe(DetailSummaryComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailSummaryComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(DetailSummaryComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits section actions', () => {
    const fixture = TestBed.createComponent(DetailSummaryComponent);
    let actionValue = '';

    fixture.componentInstance.sectionAction.subscribe((event) => {
      actionValue = event.actionValue;
    });

    fixture.componentRef.setInput('sections', [
      {
        id: 'travellers',
        title: 'Travellers',
        entries: [{ term: 'Adults', description: '2' }],
        actionLabel: 'Edit',
      },
    ]);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-button') as HTMLButtonElement;
    button.click();

    expect(actionValue).toBe('Edit');
  });
});
