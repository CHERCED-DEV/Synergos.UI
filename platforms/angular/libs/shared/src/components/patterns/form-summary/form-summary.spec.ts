import { TestBed } from '@angular/core/testing';
import { FormSummaryComponent } from './form-summary';

describe(FormSummaryComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormSummaryComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(FormSummaryComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders an empty state when there are no items', () => {
    const fixture = TestBed.createComponent(FormSummaryComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nothing to review yet');
  });

  it('emits edit actions for editable items', () => {
    const fixture = TestBed.createComponent(FormSummaryComponent);
    let editedTitle = '';

    fixture.componentInstance.itemEdited.subscribe((item) => {
      editedTitle = item.title;
    });

    fixture.componentRef.setInput('items', [
      {
        id: 'guest-1',
        title: 'Jane Doe',
        description: 'Adult',
        editable: true,
      },
    ]);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-button') as HTMLButtonElement;
    button.click();

    expect(editedTitle).toBe('Jane Doe');
  });
});
