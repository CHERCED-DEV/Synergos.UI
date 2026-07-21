import { KebabCasePipe } from './kebab-case.pipe';

describe(KebabCasePipe.name, () => {
  it('converts camelCase strings to kebab-case', () => {
    expect(new KebabCasePipe().transform('fareGroupTease')).toBe('fare-group-tease');
  });
});
