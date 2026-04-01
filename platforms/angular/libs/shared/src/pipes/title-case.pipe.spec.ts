import { TitleCasePipe } from './title-case.pipe';

describe(TitleCasePipe.name, () => {
  it('capitalises words in a sentence', () => {
    expect(new TitleCasePipe().transform('hello synergos')).toBe('Hello Synergos');
  });
});
