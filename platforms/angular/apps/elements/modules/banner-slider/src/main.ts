import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { BannerSliderElementComponent } from './banner-slider/banner-slider';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-banner-slider')) {
    const BannerSliderElement = createCustomElement(BannerSliderElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-banner-slider', BannerSliderElement);
  }
});
