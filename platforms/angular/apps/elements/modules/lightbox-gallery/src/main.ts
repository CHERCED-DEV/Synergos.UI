import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { LightboxGalleryElementComponent } from './lightbox-gallery/lightbox-gallery';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-lightbox-gallery')) {
    const LightboxGalleryElement = createCustomElement(LightboxGalleryElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-lightbox-gallery', LightboxGalleryElement);
  }
});
