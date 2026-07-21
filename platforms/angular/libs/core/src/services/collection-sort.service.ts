import { Injectable } from '@angular/core';

export type SortDirection = 'asc' | 'desc';

export interface CollectionSortOptions {
  readonly direction?: SortDirection;
  readonly locale?: string;
  readonly nulls?: 'first' | 'last';
  readonly numeric?: boolean;
  readonly zeroLast?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CollectionSortService {
  sortByPath<T>(items: readonly T[], path: string, options: CollectionSortOptions = {}): T[] {
    return [...items].sort((left, right) => this.compareByPath(left, right, path, options));
  }

  sortByNumberPath<T>(
    items: readonly T[],
    path: string,
    options: Omit<CollectionSortOptions, 'numeric'> = {},
  ): T[] {
    return this.sortByPath(items, path, {
      ...options,
      numeric: true,
    });
  }

  mergeSortByPath<T>(items: readonly T[], path: string, options: CollectionSortOptions = {}): T[] {
    if (items.length <= 1) {
      return [...items];
    }

    const middleIndex = Math.floor(items.length / 2);
    const leftItems = this.mergeSortByPath(items.slice(0, middleIndex), path, options);
    const rightItems = this.mergeSortByPath(items.slice(middleIndex), path, options);

    return this.merge(leftItems, rightItems, path, options);
  }

  private merge<T>(leftItems: readonly T[], rightItems: readonly T[], path: string, options: CollectionSortOptions): T[] {
    const mergedItems: T[] = [];
    let leftIndex = 0;
    let rightIndex = 0;

    while (leftIndex < leftItems.length && rightIndex < rightItems.length) {
      if (this.compareByPath(leftItems[leftIndex], rightItems[rightIndex], path, options) <= 0) {
        mergedItems.push(leftItems[leftIndex]);
        leftIndex += 1;
      } else {
        mergedItems.push(rightItems[rightIndex]);
        rightIndex += 1;
      }
    }

    return [...mergedItems, ...leftItems.slice(leftIndex), ...rightItems.slice(rightIndex)];
  }

  private compareByPath<T>(left: T, right: T, path: string, options: CollectionSortOptions): number {
    const leftValue = this.getValueByPath(left, path);
    const rightValue = this.getValueByPath(right, path);

    if (options.numeric) {
      return this.compareNumbers(leftValue, rightValue, options);
    }

    return this.applyDirection(this.compareValues(leftValue, rightValue, options), options.direction ?? 'asc');
  }

  private compareValues(leftValue: unknown, rightValue: unknown, options: CollectionSortOptions): number {
    const nullComparison = this.compareNullish(leftValue, rightValue, options.nulls ?? 'last');
    if (nullComparison !== null) {
      return nullComparison;
    }

    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      return leftValue.localeCompare(rightValue, options.locale);
    }

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return leftValue - rightValue;
    }

    if (leftValue instanceof Date && rightValue instanceof Date) {
      return leftValue.getTime() - rightValue.getTime();
    }

    return String(leftValue).localeCompare(String(rightValue), options.locale);
  }

  private compareNumbers(leftValue: unknown, rightValue: unknown, options: CollectionSortOptions): number {
    const leftNumber = this.toNumber(leftValue);
    const rightNumber = this.toNumber(rightValue);
    const nullComparison = this.compareNullish(leftNumber, rightNumber, options.nulls ?? 'last');

    if (nullComparison !== null) {
      return nullComparison;
    }

    if (leftNumber === null || rightNumber === null) {
      return 0;
    }

    if (options.zeroLast) {
      const leftIsZero = leftNumber === 0;
      const rightIsZero = rightNumber === 0;

      if (leftIsZero && !rightIsZero) {
        return 1;
      }

      if (!leftIsZero && rightIsZero) {
        return -1;
      }
    }

    const comparison = leftNumber - rightNumber;
    return this.applyDirection(comparison, options.direction ?? 'asc');
  }

  private compareNullish(
    leftValue: unknown,
    rightValue: unknown,
    nullPlacement: 'first' | 'last',
  ): number | null {
    const leftIsNullish = leftValue === null || leftValue === undefined;
    const rightIsNullish = rightValue === null || rightValue === undefined;

    if (!leftIsNullish && !rightIsNullish) {
      return null;
    }

    if (leftIsNullish && rightIsNullish) {
      return 0;
    }

    if (nullPlacement === 'first') {
      return leftIsNullish ? -1 : 1;
    }

    return leftIsNullish ? 1 : -1;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsedValue = Number(value);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    return null;
  }

  private applyDirection(value: number, direction: SortDirection): number {
    return direction === 'desc' ? value * -1 : value;
  }

  private getValueByPath(value: unknown, path: string): unknown {
    if (!path) {
      return value;
    }

    return path.split('.').reduce<unknown>((currentValue, pathSegment) => {
      if (currentValue === null || currentValue === undefined || typeof currentValue !== 'object') {
        return undefined;
      }

      return (currentValue as Record<string, unknown>)[pathSegment];
    }, value);
  }
}
