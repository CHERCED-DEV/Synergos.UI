import { TestBed } from '@angular/core/testing';
import { StatusTagComponent } from './status-tag';

describe(StatusTagComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusTagComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(StatusTagComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the provided status label', () => {
    const fixture = TestBed.createComponent(StatusTagComponent);
    fixture.componentRef.setInput('label', 'Confirmed');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Confirmed');
  });

  it('applies tone and style classes', () => {
    const fixture = TestBed.createComponent(StatusTagComponent);
    fixture.componentRef.setInput('tone', 'pending');
    fixture.componentRef.setInput('style', 'filled');
    fixture.detectChanges();

    const tag = fixture.nativeElement.querySelector('.syn-status-tag') as HTMLElement;
    expect(tag.className).toContain('syn-status-tag--pending');
    expect(tag.className).toContain('syn-status-tag--filled');
  });
});
