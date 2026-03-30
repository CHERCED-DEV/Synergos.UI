import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { FeatureItemComponent } from './feature-item/feature-item';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-feature-item')) {
    const FeatureItemElement = createCustomElement(FeatureItemComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-feature-item', FeatureItemElement);
  }
});
