import { RemoveHtmlTagsPipe } from './remove-html-tags.pipe';

describe(RemoveHtmlTagsPipe.name, () => {
  it('strips html tags from strings', () => {
    expect(new RemoveHtmlTagsPipe().transform('<strong>Hello</strong>')).toBe('Hello');
  });
});
