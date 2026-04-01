import { TestBed } from '@angular/core/testing';
import { DescriptionListComponent } from './description-list';

describe(DescriptionListComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DescriptionListComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(DescriptionListComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders all terms and descriptions', () => {
    const fixture = TestBed.createComponent(DescriptionListComponent);
    fixture.componentRef.setInput('items', [
      { term: 'Reference', description: 'AB-123' },
      { term: 'Status', description: 'Confirmed', emphasis: 'brand' },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Reference');
    expect(fixture.nativeElement.textContent).toContain('AB-123');
    expect(fixture.nativeElement.textContent).toContain('Confirmed');
  });

  it('applies the inline layout class', () => {
    const fixture = TestBed.createComponent(DescriptionListComponent);
    fixture.componentRef.setInput('layout', 'inline');
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('.syn-description-list') as HTMLElement;
    expect(list.className).toContain('syn-description-list--inline');
  });
});
