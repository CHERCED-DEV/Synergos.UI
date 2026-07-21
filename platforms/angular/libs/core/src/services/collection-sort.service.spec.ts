import { TestBed } from '@angular/core/testing';
import { CollectionSortService } from './collection-sort.service';

describe(CollectionSortService.name, () => {
  let service: CollectionSortService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CollectionSortService],
    });

    service = TestBed.inject(CollectionSortService);
  });

  it('sorts by nested string paths', () => {
    const items = [
      { meta: { name: 'Zulu' } },
      { meta: { name: 'Alpha' } },
      { meta: { name: 'Echo' } },
    ];

    const sortedItems = service.sortByPath(items, 'meta.name');

    expect(sortedItems.map((item) => item.meta.name)).toEqual(['Alpha', 'Echo', 'Zulu']);
  });

  it('sorts numeric values and keeps zeroes at the end when requested', () => {
    const items = [
      { price: { amount: 0 } },
      { price: { amount: 50 } },
      { price: { amount: 10 } },
    ];

    const sortedItems = service.sortByNumberPath(items, 'price.amount', { zeroLast: true });

    expect(sortedItems.map((item) => item.price.amount)).toEqual([10, 50, 0]);
  });

  it('supports merge sort for numeric values', () => {
    const items = [{ order: 3 }, { order: 1 }, { order: 2 }];

    const sortedItems = service.mergeSortByPath(items, 'order', { numeric: true });

    expect(sortedItems.map((item) => item.order)).toEqual([1, 2, 3]);
  });
});
