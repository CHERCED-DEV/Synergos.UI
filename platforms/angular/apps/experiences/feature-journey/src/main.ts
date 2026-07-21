import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { FeatureJourneyComponent } from './feature-journey/interface/feature-journey';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-feature-journey')) {
    const FeatureJourneyElement = createCustomElement(FeatureJourneyComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-feature-journey', FeatureJourneyElement);
  }
});
