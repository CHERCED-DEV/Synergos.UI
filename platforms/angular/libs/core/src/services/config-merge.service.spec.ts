import { TestBed } from '@angular/core/testing';
import { ConfigMergeService } from './config-merge.service';

interface MergeSpecConfig {
  readonly layout: {
    readonly dense: boolean;
    readonly type: string;
  };
  readonly items: readonly string[];
}

describe(ConfigMergeService.name, () => {
  let service: ConfigMergeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ConfigMergeService],
    });

    service = TestBed.inject(ConfigMergeService);
  });

  it('merges nested objects and populated arrays', () => {
    const target: MergeSpecConfig = {
      layout: { type: 'stack', dense: false },
      items: ['card-a'],
    };

    const merged = service.merge(
      target,
      {
        layout: { dense: true },
        items: ['card-b', 'card-c'],
      } as unknown as Partial<MergeSpecConfig>,
    );

    expect(merged).toEqual({
      layout: { type: 'stack', dense: true },
      items: ['card-b', 'card-c'],
    });
  });

  it('preserves the target array when the source array is empty', () => {
    const merged = service.merge(
      {
        items: ['card-a', 'card-b'],
      },
      {
        items: [],
      },
    );

    expect(merged.items).toEqual(['card-a', 'card-b']);
  });
});
