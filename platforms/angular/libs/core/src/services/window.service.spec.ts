import { TestBed } from '@angular/core/testing';
import { WindowService } from './window.service';

describe(WindowService.name, () => {
  let service: WindowService;
  const windowRecord = window as unknown as Record<string, unknown>;

  beforeEach(() => {
    delete windowRecord['__syn_window_test__'];

    TestBed.configureTestingModule({
      providers: [WindowService],
    });

    service = TestBed.inject(WindowService);
  });

  afterEach(() => {
    delete windowRecord['__syn_window_test__'];
  });

  it('reads and writes window properties', () => {
    expect(service.setProperty('__syn_window_test__', { enabled: true })).toBe(true);
    expect(service.hasProperty('__syn_window_test__')).toBe(true);
    expect(service.getProperty<{ enabled: boolean }>('__syn_window_test__')).toEqual({ enabled: true });
    expect(service.deleteProperty('__syn_window_test__')).toBe(true);
    expect(service.getProperty('__syn_window_test__')).toBeNull();
  });
});
