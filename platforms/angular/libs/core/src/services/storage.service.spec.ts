import { TestBed } from '@angular/core/testing';
import { PlatformService } from './platform.service';
import { StorageService } from './storage.service';

describe(StorageService.name, () => {
  let service: StorageService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [PlatformService, StorageService],
    });

    service = TestBed.inject(StorageService);
  });

  it('creates the storage service', () => {
    expect(service).toBeTruthy();
  });

  it('stores and retrieves string values', () => {
    service.setItem('theme', 'brand');

    expect(service.getItem('theme')).toBe('brand');
    expect(service.keys()).toContain('theme');
  });

  it('stores and retrieves objects', () => {
    service.setObject('profile', { name: 'Synergos', enabled: true });

    expect(service.getObject<{ name: string; enabled: boolean }>('profile')).toEqual({
      name: 'Synergos',
      enabled: true,
    });
  });

  it('switches to the memory adapter when requested', () => {
    service.useMemoryAdapter();
    service.setItem('session', 'memory');

    expect(service.activeAdapter()).toBe('memory');
    expect(service.getItem('session')).toBe('memory');
  });

  it('stores and retrieves session values independently from local storage', () => {
    service.setItem('theme', 'brand');
    service.setSessionItem('theme', 'session-brand');

    expect(service.getItem('theme')).toBe('brand');
    expect(service.getSessionItem('theme')).toBe('session-brand');
    expect(service.activeAdapters()).toEqual({
      local: 'browser',
      session: 'browser',
    });
  });
});
