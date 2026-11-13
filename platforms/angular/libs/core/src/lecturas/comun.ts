import { esRegistro } from '../http/borde';

/** Lo común de los lectores de las formas neutras (012-blogs-social, I4). */

export function registro(value: unknown): Record<string, unknown> {
  return esRegistro(value) ? value : {};
}

export function lista(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function presente<T>(value: T | null): value is T {
  return value !== null;
}
