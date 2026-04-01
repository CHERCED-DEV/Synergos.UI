import { ElementRef, Injectable } from '@angular/core';

type DataTarget = ElementRef<HTMLElement> | HTMLElement;

@Injectable({ providedIn: 'root' })
export class InitialDataService {
  parseValue<T>(rawValue: string | null | undefined): T | null {
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as T;
    } catch {
      return null;
    }
  }

  parseAttribute<T>(
    target: DataTarget,
    attributeNames: readonly string[] = ['data-config', 'data-initial-value'],
  ): T | null {
    const element = this.resolveElement(target);
    const rawValue = attributeNames
      .map((attributeName) => element.getAttribute(attributeName))
      .find((value): value is string => typeof value === 'string' && value.length > 0);

    if (!rawValue) {
      return null;
    }

    return this.parseValue<T>(rawValue);
  }

  private resolveElement(target: DataTarget): HTMLElement {
    return target instanceof ElementRef ? target.nativeElement : target;
  }
}
