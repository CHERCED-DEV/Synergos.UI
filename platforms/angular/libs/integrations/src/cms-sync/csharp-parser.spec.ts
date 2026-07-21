import { describe, it, expect } from 'vitest';
import { parseCSharpFile } from './csharp-parser';

describe('parseCSharpFile', () => {
  it('should parse a positional record', () => {
    const source = `
      namespace Synergos.CMS.Domain;
      public sealed record ContentHeading(
        string? HeadingText,
        string? HeadingLevel,
        string? HeadingTagOverride
      );
    `;

    const types = parseCSharpFile(source);
    expect(types).toHaveLength(1);
    expect(types[0]!.name).toBe('ContentHeading');
    expect(types[0]!.kind).toBe('record');
    expect(types[0]!.properties).toHaveLength(3);
    expect(types[0]!.properties[0]).toEqual({
      name: 'HeadingText',
      type: 'string',
      nullable: true,
    });
  });

  it('should parse a class with get/init properties', () => {
    const source = `
      namespace Synergos.CMS.Application;
      public class HeroElementViewModel : BaseViewModel
      {
        public ContentHeadingModel? Heading { get; init; }
        public ContentTextModel? Text { get; init; }
        public ContentMediaModel? Media { get; init; }
      }
    `;

    const types = parseCSharpFile(source);
    expect(types).toHaveLength(1);
    expect(types[0]!.name).toBe('HeroElementViewModel');
    expect(types[0]!.kind).toBe('class');
    expect(types[0]!.baseType).toBe('BaseViewModel');
    expect(types[0]!.properties).toHaveLength(3);
    expect(types[0]!.properties[0]).toEqual({
      name: 'Heading',
      type: 'ContentHeadingModel',
      nullable: true,
    });
  });

  it('should handle generic types in records', () => {
    const source = `
      public sealed record ContentCollection(
        string? CollectionTitle,
        IReadOnlyList<string> Items
      );
    `;

    const types = parseCSharpFile(source);
    expect(types[0]!.properties[1]).toEqual({
      name: 'Items',
      type: 'IReadOnlyList<string>',
      nullable: false,
    });
  });

  it('should handle default values', () => {
    const source = `
      public sealed record DomVariant(
        string Variant = "default",
        string Theme = "light"
      );
    `;

    const types = parseCSharpFile(source);
    expect(types[0]!.properties[0]).toEqual({
      name: 'Variant',
      type: 'string',
      nullable: false,
      defaultValue: 'default',
    });
  });

  it('should handle nullable with default null', () => {
    const source = `
      public sealed record ContentCta(
        string? CtaLabel = null,
        string? CtaUrl = null
      );
    `;

    const types = parseCSharpFile(source);
    expect(types[0]!.properties[0]!.nullable).toBe(true);
    expect(types[0]!.properties[0]!.defaultValue).toBeUndefined();
  });

  it('should skip override properties in classes', () => {
    const source = `
      public class HeroElementViewModel : BaseViewModel
      {
        public override string ViewName => "hero";
        public ContentTextModel? Text { get; init; }
      }
    `;

    const types = parseCSharpFile(source);
    expect(types[0]!.properties).toHaveLength(1);
    expect(types[0]!.properties[0]!.name).toBe('Text');
  });

  it('should return empty array for no types', () => {
    const source = `
      // just a comment
      using System;
    `;

    const types = parseCSharpFile(source);
    expect(types).toHaveLength(0);
  });

  it('should handle multiple types in one file', () => {
    const source = `
      public sealed record ContentText(string? Title, string? Body);
      public sealed record ContentMedia(string? Src, string? Alt);
    `;

    const types = parseCSharpFile(source);
    expect(types).toHaveLength(2);
    expect(types[0]!.name).toBe('ContentText');
    expect(types[1]!.name).toBe('ContentMedia');
  });
});
