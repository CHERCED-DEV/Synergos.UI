import { Injectable } from '@angular/core';

type PlainObject = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class ConfigMergeService {
  merge<T>(target: T, source: Partial<T> | null | undefined): T {
    if (!this.isPlainObject(target)) {
      throw new Error('Target must be a non-null object.');
    }

    if (!this.isPlainObject(source)) {
      return target;
    }

    return this.mergeObjects(target as PlainObject, source as PlainObject) as T;
  }

  mergeMany<T>(target: T, ...sources: readonly (Partial<T> | null | undefined)[]): T {
    return sources.reduce<T>((mergedTarget, source) => this.merge(mergedTarget, source), target);
  }

  private mergeObjects(target: PlainObject, source: PlainObject): PlainObject {
    const mergedObject: PlainObject = { ...target };

    for (const [key, sourceValue] of Object.entries(source)) {
      const targetValue = mergedObject[key];

      if (Array.isArray(sourceValue)) {
        mergedObject[key] =
          sourceValue.length > 0
            ? this.cloneArray(sourceValue)
            : Array.isArray(targetValue)
              ? this.cloneArray(targetValue)
              : [];
        continue;
      }

      if (this.isPlainObject(sourceValue) && this.isPlainObject(targetValue)) {
        mergedObject[key] = this.mergeObjects(targetValue, sourceValue);
        continue;
      }

      if (this.isPlainObject(sourceValue)) {
        mergedObject[key] = this.mergeObjects({}, sourceValue);
        continue;
      }

      mergedObject[key] = sourceValue;
    }

    return mergedObject;
  }

  private cloneArray(array: readonly unknown[]): unknown[] {
    return array.map((item) => this.cloneValue(item));
  }

  private cloneValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return this.cloneArray(value);
    }

    if (this.isPlainObject(value)) {
      return this.mergeObjects({}, value);
    }

    return value;
  }

  private isPlainObject(item: unknown): item is PlainObject {
    return (
      item !== null &&
      typeof item === 'object' &&
      Object.getPrototypeOf(item) === Object.prototype &&
      !Array.isArray(item)
    );
  }
}
