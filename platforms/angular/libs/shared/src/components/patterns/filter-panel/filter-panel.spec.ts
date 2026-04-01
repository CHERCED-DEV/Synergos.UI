import { TestBed } from '@angular/core/testing';
import { FilterPanelComponent } from './filter-panel';

describe(FilterPanelComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilterPanelComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(FilterPanelComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits state changes when an option is selected', () => {
    const fixture = TestBed.createComponent(FilterPanelComponent);
    let emittedSelection: readonly string[] = [];

    fixture.componentInstance.stateChange.subscribe((state) => {
      const values = state.values['fare'];
      emittedSelection = Array.isArray(values) ? values : [];
    });

    fixture.componentRef.setInput('sections', [
      {
        id: 'fare',
        type: 'single',
        title: 'Fare family',
        options: [
          { id: 'basic', label: 'Basic' },
          { id: 'plus', label: 'Plus' },
        ],
      },
    ]);
    fixture.detectChanges();

    const option = fixture.nativeElement.querySelector(
      '.syn-option-list__option',
    ) as HTMLButtonElement;
    option.click();

    expect(emittedSelection).toEqual(['basic']);
  });

  it('clears the current filters', () => {
    const fixture = TestBed.createComponent(FilterPanelComponent);
    let clearedState: readonly string[] = ['seed'];

    fixture.componentInstance.cleared.subscribe((state) => {
      const values = state.values['fare'];
      clearedState = Array.isArray(values) ? values : [];
    });

    fixture.componentRef.setInput('sections', [
      {
        id: 'fare',
        type: 'multiple',
        title: 'Fare family',
        options: [{ id: 'basic', label: 'Basic', selected: true }],
      },
    ]);
    fixture.detectChanges();

    const clearButton = fixture.nativeElement.querySelector('.syn-button--ghost') as HTMLButtonElement;
    clearButton.click();

    expect(clearedState).toEqual([]);
  });
});
