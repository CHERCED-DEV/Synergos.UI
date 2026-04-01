import { TestBed } from '@angular/core/testing';
import { PaginatorComponent } from './paginator';

describe(PaginatorComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginatorComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    fixture.componentRef.setInput('totalPages', 6);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits a new page when selecting next', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    const selected: number[] = [];
    fixture.componentInstance.currentPageChange.subscribe((page) => {
      selected.push(page);
    });
    fixture.componentRef.setInput('totalPages', 6);
    fixture.detectChanges();

    const nextButton = fixture.nativeElement.querySelectorAll('.syn-paginator__nav')[1] as HTMLButtonElement;
    nextButton.click();

    expect(selected).toEqual([2]);
  });

  it('renders ellipsis for long page ranges', () => {
    const fixture = TestBed.createComponent(PaginatorComponent);
    fixture.componentRef.setInput('totalPages', 12);
    fixture.componentRef.setInput('currentPage', 6);
    fixture.componentRef.setInput('pagesToShow', 5);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('...');
  });
});
