import { ElementRef, Injectable } from '@angular/core';

type QueryTarget = ElementRef<HTMLElement> | HTMLElement | ParentNode;

@Injectable({ providedIn: 'root' })
export class ElementQueryService {
  findFirst<TElement extends Element = HTMLElement>(target: QueryTarget, selector: string): TElement | null {
    return this.resolveTarget(target).querySelector(selector) as TElement | null;
  }

  findAll<TElement extends Element = HTMLElement>(target: QueryTarget, selector: string): TElement[] {
    return Array.from(this.resolveTarget(target).querySelectorAll(selector)) as TElement[];
  }

  findFirstInvalid(target: QueryTarget, selector = '.ng-invalid, [aria-invalid="true"]'): HTMLElement | null {
    return this.findFirst<HTMLElement>(target, selector);
  }

  private resolveTarget(target: QueryTarget): ParentNode {
    return target instanceof ElementRef ? target.nativeElement : target;
  }
}
