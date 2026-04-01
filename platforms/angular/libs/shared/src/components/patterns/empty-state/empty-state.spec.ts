import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state';

describe(EmptyStateComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders provided copy', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.componentRef.setInput('title', 'Nothing here yet');
    fixture.componentRef.setInput('description', 'Create your first module to get started.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nothing here yet');
    expect(fixture.nativeElement.textContent).toContain('Create your first module');
  });

  it('emits the primary action when the button is clicked', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    let actionCount = 0;
    fixture.componentInstance.action.subscribe(() => {
      actionCount += 1;
    });
    fixture.componentRef.setInput('actionLabel', 'Create item');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-button') as HTMLButtonElement;
    button.click();

    expect(actionCount).toBe(1);
  });
});
