import { TestBed } from '@angular/core/testing';
import { LiveRegionComponent } from './live-region';

describe(LiveRegionComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveRegionComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(LiveRegionComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the live message', () => {
    const fixture = TestBed.createComponent(LiveRegionComponent);
    fixture.componentRef.setInput('message', 'Filters updated');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Filters updated');
  });

  it('supports visible live regions', () => {
    const fixture = TestBed.createComponent(LiveRegionComponent);
    fixture.componentRef.setInput('visuallyHidden', false);
    fixture.detectChanges();

    const region = fixture.nativeElement.querySelector('.syn-live-region') as HTMLElement;
    expect(region.className).not.toContain('syn-live-region--hidden');
  });
});
