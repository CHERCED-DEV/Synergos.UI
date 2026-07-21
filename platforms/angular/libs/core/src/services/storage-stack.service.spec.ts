import { TestBed } from '@angular/core/testing';
import { PlatformService } from './platform.service';
import { StorageService } from './storage.service';
import { StorageStackService } from './storage-stack.service';

describe(StorageStackService.name, () => {
  let service: StorageStackService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [PlatformService, StorageService, StorageStackService],
    });

    service = TestBed.inject(StorageStackService);
  });

  it('pushes unique items and respects the configured limit', () => {
    service.push('recent-searches', { id: 1 }, { limit: 2 });
    service.push('recent-searches', { id: 2 }, { limit: 2 });
    service.push('recent-searches', { id: 1 }, { limit: 2 });

    expect(service.getAll<{ id: number }>('recent-searches')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('supports session storage stacks', () => {
    service.push('filters', 'one', { area: 'session' });
    service.update('filters', 0, 'updated', 'session');

    expect(service.peek<string>('filters', 'session')).toBe('updated');

    service.clear('filters', 'session');

    expect(sessionStorage.getItem('filters')).toBe('[]');
  });
});
