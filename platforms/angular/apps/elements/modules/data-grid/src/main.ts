import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { DataGridElementComponent } from './data-grid/data-grid';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-data-grid')) {
    const DataGridElement = createCustomElement(DataGridElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-data-grid', DataGridElement);
  }
});
