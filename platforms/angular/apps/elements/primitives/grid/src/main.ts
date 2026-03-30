import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { GridComponent } from './grid/grid';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-grid')) {
    const GridElement = createCustomElement(GridComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-grid', GridElement);
  }
});
