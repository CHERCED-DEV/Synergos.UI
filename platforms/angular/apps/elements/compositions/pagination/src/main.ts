import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { PaginationElementComponent } from './pagination/pagination';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-pagination')) {
    const PaginationElement = createCustomElement(PaginationElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-pagination', PaginationElement);
  }
});
