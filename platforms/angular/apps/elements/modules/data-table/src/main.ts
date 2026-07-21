import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { DataTableElementComponent } from './data-table/data-table';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-data-table')) {
    const DataTableElement = createCustomElement(DataTableElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-data-table', DataTableElement);
  }
});
