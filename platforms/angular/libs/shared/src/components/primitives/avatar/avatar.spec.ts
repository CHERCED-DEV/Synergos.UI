import { TestBed } from '@angular/core/testing';
import { AvatarComponent } from './avatar';

describe(AvatarComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders initials when image is not available', () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('name', 'Synergos Team');
    fixture.detectChanges();

    const initials = fixture.nativeElement.querySelector('.syn-avatar__initials') as HTMLSpanElement;
    expect(initials.textContent?.trim()).toBe('ST');
  });

  it('applies the xl size', () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('name', 'Synergos Team');
    fixture.componentRef.setInput('size', 'xl');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-avatar')?.classList.contains('syn-avatar--xl')).toBe(true);
  });

  it('loads the photo lazily only when asked', () => {
    const fixture = TestBed.createComponent(AvatarComponent);
    fixture.componentRef.setInput('name', 'Synergos Team');
    fixture.componentRef.setInput('src', '/media/team.jpg');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.syn-avatar__image') as HTMLImageElement;
    expect(image.getAttribute('loading')).toBeNull();

    fixture.componentRef.setInput('loading', 'lazy');
    fixture.detectChanges();

    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('decoding')).toBe('async');
  });
});