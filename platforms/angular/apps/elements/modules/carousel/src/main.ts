import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CarouselElementComponent } from './carousel/carousel';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-carousel')) {
    const CarouselElement = createCustomElement(CarouselElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-carousel', CarouselElement);
  }
});
