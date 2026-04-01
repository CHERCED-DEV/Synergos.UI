import { MaskPipe } from './mask.pipe';

describe(MaskPipe.name, () => {
  it('applies masks to string values', () => {
    expect(new MaskPipe().transform('1234567890', '(###) ###-####')).toBe('(123) 456-7890');
  });
});
