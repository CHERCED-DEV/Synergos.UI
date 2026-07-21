import { TestBed } from '@angular/core/testing';
import { LiveAnnouncerService } from '../../../services/live-announcer.service';
import { PanelComponent } from './panel';

describe(PanelComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelComponent],
      providers: [LiveAnnouncerService],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(PanelComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('dismisses and announces the panel', () => {
    const fixture = TestBed.createComponent(PanelComponent);
    const announcer = TestBed.inject(LiveAnnouncerService);
    const dismissSpy = vi.spyOn(announcer, 'announce');
    const dismissed = vi.fn();

    fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.componentRef.setInput('dismissible', true);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-panel__dismiss') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(dismissSpy).toHaveBeenCalledWith('Panel dismissed');
    expect(fixture.nativeElement.textContent).not.toContain('x');
  });
});
