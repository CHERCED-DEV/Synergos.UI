import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { HeroBannerElementComponent } from './hero-banner/hero-banner';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-hero-banner')) {
    const HeroBannerElement = createCustomElement(HeroBannerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-hero-banner', HeroBannerElement);
  }
});
