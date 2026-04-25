import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { BreadcrumbElementComponent } from './breadcrumb/breadcrumb';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-breadcrumb')) {
    const BreadcrumbElement = createCustomElement(BreadcrumbElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-breadcrumb', BreadcrumbElement);
  }
});
