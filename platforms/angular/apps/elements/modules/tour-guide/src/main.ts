import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TourGuideElementComponent } from './tour-guide/tour-guide';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-tour-guide')) {
    const TourGuideElement = createCustomElement(TourGuideElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-tour-guide', TourGuideElement);
  }
});
