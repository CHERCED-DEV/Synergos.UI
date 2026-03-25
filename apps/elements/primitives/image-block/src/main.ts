import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ImageBlockComponent } from './image-block/image-block';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-image-block')) {
    const ImageBlockElement = createCustomElement(ImageBlockComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-image-block', ImageBlockElement);
  }
});
