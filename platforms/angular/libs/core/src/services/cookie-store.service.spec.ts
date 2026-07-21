import { TestBed } from '@angular/core/testing';
import { CookieStoreService } from './cookie-store.service';

describe(CookieStoreService.name, () => {
  let service: CookieStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CookieStoreService],
    });

    service = TestBed.inject(CookieStoreService);
    document.cookie = 'alpha=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    document.cookie = 'beta=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  });

  it('stores and retrieves cookies', () => {
    service.set('alpha', 'one');

    expect(service.get('alpha')).toBe('one');
    expect(service.has('alpha')).toBe(true);
  });

  it('lists all cookies', () => {
    service.set('alpha', 'one');
    service.set('beta', 'two');

    expect(service.all()).toEqual({
      alpha: 'one',
      beta: 'two',
    });
  });

  it('removes and clears cookies', () => {
    service.set('alpha', 'one');
    service.set('beta', 'two');
    service.remove('alpha');

    expect(service.get('alpha')).toBeNull();

    service.clear();

    expect(service.all()).toEqual({});
  });
});
