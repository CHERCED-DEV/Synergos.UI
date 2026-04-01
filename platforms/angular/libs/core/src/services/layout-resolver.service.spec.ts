import { TestBed } from '@angular/core/testing';
import { LAYOUT_TEMPLATE_MAP } from '../core.tokens';
import { LayoutResolverService } from './layout-resolver.service';

describe(LayoutResolverService.name, () => {
  let service: LayoutResolverService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LayoutResolverService,
        {
          provide: LAYOUT_TEMPLATE_MAP,
          useValue: {
            hero: 'hero-split',
          },
        },
      ],
    });

    service = TestBed.inject(LayoutResolverService);
  });

  it('resolves configured templates and falls back when missing', () => {
    expect(service.resolve('hero', 'hero-default')).toBe('hero-split');
    expect(service.resolve('gallery', 'gallery-default')).toBe('gallery-default');
  });
});
