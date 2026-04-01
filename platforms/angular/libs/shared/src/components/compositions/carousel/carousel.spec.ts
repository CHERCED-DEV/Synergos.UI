import { TestBed } from '@angular/core/testing';
import { CarouselComponent } from './carousel';

describe(CarouselComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CarouselComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the active image item', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.componentRef.setInput('items', [
      { src: '/hero.jpg', alt: 'Hero image' },
      { src: '/detail.jpg', alt: 'Detail image' },
    ]);
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.syn-carousel__media') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/hero.jpg');
  });

  it('moves to the next slide when requested', () => {
    const fixture = TestBed.createComponent(CarouselComponent);
    fixture.componentRef.setInput('items', [
      { src: '/hero.jpg', alt: 'Hero image' },
      { src: '/detail.jpg', alt: 'Detail image' },
    ]);
    fixture.detectChanges();

    const nextButton = fixture.nativeElement.querySelectorAll('.syn-carousel__control')[1] as HTMLButtonElement;
    nextButton.click();
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.syn-carousel__media') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/detail.jpg');
  });
});
