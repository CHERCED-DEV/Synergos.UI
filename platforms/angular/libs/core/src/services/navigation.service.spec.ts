import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { NavigationService } from './navigation.service';
import { WindowService } from './window.service';

describe(NavigationService.name, () => {
  const assign = vi.fn();
  const back = vi.fn();
  const forward = vi.fn();
  const open = vi.fn();
  const pushState = vi.fn();
  const reload = vi.fn();
  const replace = vi.fn();

  const windowStub = {
    history: {
      back,
      forward,
      pushState,
    },
    location: {
      assign,
      href: 'https://synergos.test/current',
      pathname: '/current',
      reload,
      replace,
    },
    open,
  } as unknown as Window;

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        NavigationService,
        {
          provide: WindowService,
          useValue: {
            getWindow: () => windowStub,
          },
        },
      ],
    });
  });

  it('builds urls with query params and hash', () => {
    const service = TestBed.inject(NavigationService);

    expect(
      service.buildUrl('/products', {
        hash: 'pricing',
        params: { page: 2, search: 'plan' },
      }),
    ).toBe('https://synergos.test/products?page=2&search=plan#pricing');
  });

  it('navigates with assign, replace and target support', () => {
    const service = TestBed.inject(NavigationService);

    service.navigate('/pricing');
    service.replace('/checkout');
    service.navigate('/docs', { target: '_blank' });

    expect(assign).toHaveBeenCalledWith('https://synergos.test/pricing');
    expect(replace).toHaveBeenCalledWith('https://synergos.test/checkout');
    expect(open).toHaveBeenCalledWith('https://synergos.test/docs', '_blank', 'noopener,noreferrer');
  });

  it('uses history navigation helpers', () => {
    const service = TestBed.inject(NavigationService);

    service.navigate('/stateful', { state: { step: 2 } });
    service.back();
    service.forward();
    service.reload();

    expect(pushState).toHaveBeenCalledWith({ step: 2 }, '', 'https://synergos.test/stateful');
    expect(back).toHaveBeenCalled();
    expect(forward).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });
});
