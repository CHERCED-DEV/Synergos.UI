/**
 * Maps C# type names to their TypeScript equivalents.
 *
 * Handles primitives, common BCL types, known domain types, generic
 * collections, and strips Model/ViewModel suffixes from composition types.
 */

/** C# primitive and BCL type mappings */
const PRIMITIVE_MAP: Record<string, string> = {
  'string': 'string',
  'int': 'number',
  'long': 'number',
  'double': 'number',
  'float': 'number',
  'decimal': 'number',
  'bool': 'boolean',
  'Boolean': 'boolean',
  'Int32': 'number',
  'Int64': 'number',
  'Double': 'number',
  'Single': 'number',
  'Decimal': 'number',
  'DateTime': 'string',
  'DateTimeOffset': 'string',
  'Guid': 'string',
  'JsonElement': 'Record<string, unknown>',
  'object': 'unknown',
};

/** Known domain value objects that map to themselves (shared contract) */
const DOMAIN_PASSTHROUGH: ReadonlySet<string> = new Set([
  'Image',
  'Link',
]);

/**
 * Regex to match generic collection types:
 * IReadOnlyList<T>, List<T>, IEnumerable<T>, ICollection<T>, IList<T>
 */
const GENERIC_LIST_RE = /^(?:IReadOnlyList|List|IEnumerable|ICollection|IList)<(.+)>$/;

/** Regex to match dictionary types */
const GENERIC_DICT_RE = /^(?:IDictionary|Dictionary|IReadOnlyDictionary)<(.+),\s*(.+)>$/;

/**
 * Strip known suffixes from C# type names to produce clean TS interface names.
 *
 * ContentHeadingModel → ContentHeading
 * HeroElementViewModel → HeroElement
 * BaseComponentViewModel → BaseComponent
 */
function stripSuffixes(name: string): string {
  return name
    .replace(/ViewModel$/, '')
    .replace(/Model$/, '');
}

/**
 * Map a C# type string to its TypeScript equivalent.
 *
 * Examples:
 *   mapCSharpTypeToTs('string')               → 'string'
 *   mapCSharpTypeToTs('int')                  → 'number'
 *   mapCSharpTypeToTs('bool')                 → 'boolean'
 *   mapCSharpTypeToTs('DateTime')             → 'string'
 *   mapCSharpTypeToTs('Image')                → 'Image'
 *   mapCSharpTypeToTs('Link')                 → 'Link'
 *   mapCSharpTypeToTs('IReadOnlyList<string>') → 'readonly string[]'
 *   mapCSharpTypeToTs('JsonElement')          → 'Record<string, unknown>'
 *   mapCSharpTypeToTs('ContentHeadingModel')  → 'ContentHeading'
 *   mapCSharpTypeToTs('HeroElementViewModel') → 'HeroElement'
 */
export function mapCSharpTypeToTs(csType: string): string {
  const trimmed = csType.trim();

  // 1. Exact primitive / BCL match
  const primitive = PRIMITIVE_MAP[trimmed];
  if (primitive !== undefined) return primitive;

  // 2. Known domain value objects
  if (DOMAIN_PASSTHROUGH.has(trimmed)) return trimmed;

  // 3. Generic list/collection → readonly T[]
  const listMatch = GENERIC_LIST_RE.exec(trimmed);
  if (listMatch) {
    const inner = mapCSharpTypeToTs(listMatch[1]!);
    return `readonly ${inner}[]`;
  }

  // 4. Generic dictionary → Record<K, V>
  const dictMatch = GENERIC_DICT_RE.exec(trimmed);
  if (dictMatch) {
    const key = mapCSharpTypeToTs(dictMatch[1]!);
    const value = mapCSharpTypeToTs(dictMatch[2]!);
    return `Record<${key}, ${value}>`;
  }

  // 5. Strip Model/ViewModel suffixes from composition types
  return stripSuffixes(trimmed);
}
