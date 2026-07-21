/**
 * Joins truthy CSS class names into a single string.
 * Usage: classNames('btn', isActive && 'btn--active', variant && `btn--${variant}`)
 */
export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
