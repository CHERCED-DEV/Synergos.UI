import { describe, it, expect } from 'vitest';
import { emitInterface, emitBarrelExport, emitFileHeader } from './ts-emitter';
import type { CSharpType } from './csharp-parser';
import { mapCSharpTypeToTs } from './type-mapper';

describe('emitInterface', () => {
  it('should emit a TypeScript interface from a record', () => {
    const type: CSharpType = {
      name: 'ContentHeading',
      kind: 'record',
      properties: [
        { name: 'HeadingText', type: 'string', nullable: true },
        { name: 'HeadingLevel', type: 'string', nullable: false },
      ],
    };

    const result = emitInterface(type, mapCSharpTypeToTs);
    expect(result).toContain('export interface ContentHeading {');
    expect(result).toContain('readonly headingText?: string;');
    expect(result).toContain('readonly headingLevel: string;');
    expect(result).toContain('}');
  });

  it('should strip ViewModel suffix', () => {
    const type: CSharpType = {
      name: 'HeroElementViewModel',
      kind: 'class',
      properties: [
        { name: 'Text', type: 'string', nullable: false },
      ],
    };

    const result = emitInterface(type, mapCSharpTypeToTs);
    expect(result).toContain('export interface HeroElement {');
  });

  it('should strip Model suffix', () => {
    const type: CSharpType = {
      name: 'ContentHeadingModel',
      kind: 'record',
      properties: [
        { name: 'Title', type: 'string', nullable: false },
      ],
    };

    const result = emitInterface(type, mapCSharpTypeToTs);
    expect(result).toContain('export interface ContentHeading {');
  });

  it('should convert PascalCase to camelCase', () => {
    const type: CSharpType = {
      name: 'TestType',
      kind: 'record',
      properties: [
        { name: 'CtaLabel', type: 'string', nullable: false },
        { name: 'CtaUrl', type: 'string', nullable: true },
      ],
    };

    const result = emitInterface(type, mapCSharpTypeToTs);
    expect(result).toContain('readonly ctaLabel: string;');
    expect(result).toContain('readonly ctaUrl?: string;');
  });

  it('should include default value comment', () => {
    const type: CSharpType = {
      name: 'DomVariant',
      kind: 'record',
      properties: [
        { name: 'Variant', type: 'string', nullable: false, defaultValue: 'default' },
      ],
    };

    const result = emitInterface(type, mapCSharpTypeToTs);
    expect(result).toContain('// default: "default"');
  });
});

describe('emitBarrelExport', () => {
  it('should emit barrel with re-exports', () => {
    const result = emitBarrelExport(['shared.generated', 'elements.generated']);
    expect(result).toContain("export * from './shared.generated';");
    expect(result).toContain("export * from './elements.generated';");
  });
});

describe('emitFileHeader', () => {
  it('should include auto-generated notice', () => {
    const header = emitFileHeader();
    expect(header).toContain('AUTO-GENERATED');
    expect(header).toContain('cms-sync');
  });
});
