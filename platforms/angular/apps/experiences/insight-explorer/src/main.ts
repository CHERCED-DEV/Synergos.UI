import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { InsightExplorerComponent } from './insight-explorer/interface/insight-explorer';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-insight-explorer')) {
    const InsightExplorerElement = createCustomElement(InsightExplorerComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-insight-explorer', InsightExplorerElement);
  }
});
