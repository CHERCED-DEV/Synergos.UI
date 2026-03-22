import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { BannerComponent } from './banner/banner';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-banner')) {
    const BannerElement = createCustomElement(BannerComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-banner', BannerElement);
  }
});
