import { TestBed } from '@angular/core/testing';
import { SkeletonService } from './skeleton.service';

describe(SkeletonService.name, () => {
  let service: SkeletonService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SkeletonService],
    });

    service = TestBed.inject(SkeletonService);
  });

  it('registers and updates loading states', () => {
    service.register('card-list', {
      blocks: 3,
      loading: true,
    });
    service.setLoading('card-list', false);

    expect(service.isLoading('card-list')).toBe(false);
    expect(service.getState('card-list')?.blocks).toBe(3);
  });

  it('removes and clears entries', () => {
    service.register('hero', { loading: true });
    service.unregister('hero');

    expect(service.getState('hero')).toBeUndefined();

    service.register('panel', { loading: true });
    service.clear();

    expect(service.snapshot()).toEqual([]);
  });
});
