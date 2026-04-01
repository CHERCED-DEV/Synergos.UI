import { TestBed } from '@angular/core/testing';
import { SkeletonComponent } from './skeleton';

describe(SkeletonComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(SkeletonComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the requested number of skeleton lines', () => {
    const fixture = TestBed.createComponent(SkeletonComponent);
    fixture.componentRef.setInput('lines', 3);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.syn-skeleton__item');
    expect(items.length).toBe(3);
  });

  it('renders a circular skeleton placeholder', () => {
    const fixture = TestBed.createComponent(SkeletonComponent);
    fixture.componentRef.setInput('shape', 'circle');
    fixture.detectChanges();

    const skeleton = fixture.nativeElement.querySelector('.syn-skeleton') as HTMLElement;
    expect(skeleton.className).toContain('syn-skeleton--circle');
  });
});
