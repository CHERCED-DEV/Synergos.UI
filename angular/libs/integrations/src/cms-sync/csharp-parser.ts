/**
 * Lightweight C# record/class parser.
 *
 * Extracts record and class definitions with their properties from .cs source
 * strings. Handles positional records, class properties with { get; init; },
 * nullable types, default values, generic types, and inheritance.
 */

export interface CSharpProperty {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}

export interface CSharpType {
  name: string;
  kind: 'record' | 'class';
  baseType?: string;
  properties: CSharpProperty[];
}

/**
 * Parse a single C# type string into its base name and nullable flag.
 * Handles generics like `IReadOnlyList<string>` and nullable markers.
 */
function parseTypeToken(raw: string): { type: string; nullable: boolean } {
  const trimmed = raw.trim();
  const nullable = trimmed.endsWith('?');
  const type = nullable ? trimmed.slice(0, -1) : trimmed;
  return { type, nullable };
}

/**
 * Extract positional parameters from a record declaration.
 *
 * Given `string? HeadingText, string? HeadingLevel, string? HeadingTagOverride`
 * returns an array of CSharpProperty.
 */
function parsePositionalParams(paramBlock: string): CSharpProperty[] {
  const properties: CSharpProperty[] = [];
  const params = splitTopLevelCommas(paramBlock);

  for (const param of params) {
    const trimmed = param.trim();
    if (!trimmed) continue;

    // Split on '=' for default values
    const [declaration, ...defaultParts] = trimmed.split('=');
    const defaultValue = defaultParts.length > 0
      ? defaultParts.join('=').trim()
      : undefined;

    const decl = declaration!.trim();

    // Find the last whitespace that is not inside angle brackets to split type from name
    const splitIdx = findTypeBoundary(decl);
    if (splitIdx === -1) continue;

    const rawType = decl.slice(0, splitIdx).trim();
    const name = decl.slice(splitIdx).trim();
    const { type, nullable } = parseTypeToken(rawType);

    const cleanDefault = defaultValue !== undefined
      ? cleanDefaultValue(defaultValue)
      : undefined;

    properties.push({
      name,
      type,
      nullable: nullable || cleanDefault === 'null',
      ...(cleanDefault !== undefined && cleanDefault !== 'null' ? { defaultValue: cleanDefault } : {}),
    });
  }

  return properties;
}

/**
 * Find the boundary between type and parameter name in a declaration.
 * Must handle generics like `IReadOnlyList<string>`.
 */
function findTypeBoundary(decl: string): number {
  let depth = 0;
  let lastSpace = -1;

  for (let i = 0; i < decl.length; i++) {
    const ch = decl[i];
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    else if (ch === ' ' && depth === 0) lastSpace = i;
  }

  return lastSpace === -1 ? -1 : lastSpace + 1;
}

/**
 * Split a parameter list on commas, but only at the top level (not inside angle brackets).
 */
function splitTopLevelCommas(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of input) {
    if (ch === '<') depth++;
    else if (ch === '>') depth--;

    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

/**
 * Clean a C# default value literal for storage.
 */
function cleanDefaultValue(value: string): string {
  let v = value.trim();
  // Remove trailing semicolons or parens from record syntax
  v = v.replace(/[);]+$/, '').trim();
  // Remove surrounding quotes for string literals, store the inner value
  if (v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1);
  }
  return v;
}

/**
 * Parse class-style properties with `{ get; init; }` or `{ get; set; }`.
 *
 * Matches patterns like:
 *   public ContentHeadingModel? Heading { get; init; }
 *   public override string ViewName => "...";
 */
function parseClassProperties(classBody: string): CSharpProperty[] {
  const properties: CSharpProperty[] = [];

  // Match: public [override] <type> <name> { get; init; } or { get; set; }
  const propRegex = /public\s+(?!override\b)(\S+)\s+(\w+)\s*\{\s*get;\s*(?:init|set);\s*\}/g;
  let match: RegExpExecArray | null;

  while ((match = propRegex.exec(classBody)) !== null) {
    const rawType = match[1]!;
    const name = match[2]!;
    const { type, nullable } = parseTypeToken(rawType);

    properties.push({ name, type, nullable });
  }

  return properties;
}

/**
 * Extract the body of a class (everything between the outermost `{` and `}`).
 */
function extractClassBody(source: string, classStartIdx: number): string | null {
  let braceDepth = 0;
  let bodyStart = -1;

  for (let i = classStartIdx; i < source.length; i++) {
    if (source[i] === '{') {
      if (braceDepth === 0) bodyStart = i + 1;
      braceDepth++;
    } else if (source[i] === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        return source.slice(bodyStart, i);
      }
    }
  }

  return null;
}

/**
 * Parse all record and class definitions from a C# source string.
 */
export function parseCSharpFile(source: string): CSharpType[] {
  const types: CSharpType[] = [];

  // Remove single-line comments
  const cleaned = source.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  const noComments = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove XML doc comments
  const noXml = noComments.replace(/\/\/\/.*$/gm, '');
  // Remove using statements
  const noUsing = noXml.replace(/^using\s+.*?;$/gm, '');
  // Remove namespace declarations (both block and file-scoped)
  const noNamespace = noUsing.replace(/namespace\s+[\w.]+\s*[;{]?/g, '');

  // ── Parse positional records ──────────────────────────────────────────
  // Match: public [sealed] record <Name>(<params>);
  // or multi-line: public [sealed] record <Name>(\n  params\n);
  const recordRegex = /public\s+(?:sealed\s+)?record\s+(\w+)\s*\(([\s\S]*?)\)\s*;/g;
  let match: RegExpExecArray | null;

  while ((match = recordRegex.exec(noNamespace)) !== null) {
    const name = match[1]!;
    const paramBlock = match[2]!;
    const properties = parsePositionalParams(paramBlock);

    types.push({ name, kind: 'record', properties });
  }

  // ── Parse classes ─────────────────────────────────────────────────────
  // Match: public [sealed|abstract] class <Name> [: BaseType]
  const classRegex = /public\s+(?:sealed\s+|abstract\s+)?class\s+(\w+)(?:\s*:\s*(\w+))?\s*\{/g;

  while ((match = classRegex.exec(noNamespace)) !== null) {
    const name = match[1]!;
    const baseType = match[2] || undefined;
    const classBody = extractClassBody(noNamespace, match.index + match[0].indexOf('{'));

    if (classBody === null) continue;

    const properties = parseClassProperties(classBody);

    types.push({
      name,
      kind: 'class',
      ...(baseType ? { baseType } : {}),
      properties,
    });
  }

  return types;
}
