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
});