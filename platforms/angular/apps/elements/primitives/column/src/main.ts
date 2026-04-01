import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ColumnComponent } from './column/column';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-column')) {
    const ColumnElement = createCustomElement(ColumnComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-column', ColumnElement);
  }
});
