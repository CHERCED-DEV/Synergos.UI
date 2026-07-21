import { TestBed } from '@angular/core/testing';
import { LiveAnnouncerService } from './live-announcer.service';

describe(LiveAnnouncerService.name, () => {
  let service: LiveAnnouncerService;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';

    TestBed.configureTestingModule({
      providers: [LiveAnnouncerService],
    });

    service = TestBed.inject(LiveAnnouncerService);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('creates the announcer service', () => {
    expect(service).toBeTruthy();
  });

  it('announces and clears messages in a live region', () => {
    service.announce('Saved');
    vi.advanceTimersByTime(100);

    const region = document.body.querySelector('[data-syn-live-announcer="true"]');
    expect(region?.textContent).toBe('Saved');

    vi.advanceTimersByTime(2900);
    expect(region?.textContent).toBe('');
  });
});
