import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { FeatureGridComponent } from './feature-grid/feature-grid';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-feature-grid')) {
    const FeatureGridElement = createCustomElement(FeatureGridComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-feature-grid', FeatureGridElement);
  }
});
