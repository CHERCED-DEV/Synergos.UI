import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { GalleryItemElementComponent } from './gallery-item/gallery-item';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-gallery-item')) {
    const GalleryItemElement = createCustomElement(GalleryItemElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-gallery-item', GalleryItemElement);
  }
});
