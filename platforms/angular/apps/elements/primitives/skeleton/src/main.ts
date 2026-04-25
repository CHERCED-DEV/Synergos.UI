import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SkeletonElementComponent } from './skeleton/skeleton';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-skeleton')) {
    const SkeletonElement = createCustomElement(SkeletonElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-skeleton', SkeletonElement);
  }
});
