import { TestBed } from '@angular/core/testing';
import { LiveAnnouncerService } from '../../../services/live-announcer.service';
import { SectionComponent } from './section';

describe(SectionComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SectionComponent],
      providers: [LiveAnnouncerService],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(SectionComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('toggles collapsed state when configured as collapsible', () => {
    const fixture = TestBed.createComponent(SectionComponent);
    const changed = vi.fn();

    fixture.componentInstance.collapsedChange.subscribe(changed);
    fixture.componentRef.setInput('collapsible', true);
    fixture.componentRef.setInput('title', 'Details');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-section__toggle') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledWith(true);
    expect(fixture.componentInstance.collapsed()).toBe(true);
  });
});
