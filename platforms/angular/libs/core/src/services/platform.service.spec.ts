import { TestBed } from '@angular/core/testing';
import { PlatformService } from './platform.service';

describe(PlatformService.name, () => {
  let service: PlatformService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PlatformService],
    });

    service = TestBed.inject(PlatformService);
  });

  it('creates the platform service', () => {
    expect(service).toBeTruthy();
  });

  it('runs callbacks in browser environments', () => {
    const value = service.runInBrowser(() => 'ready', 'fallback');

    expect(value).toBe('ready');
    expect(service.isBrowser()).toBe(true);
  });
});
