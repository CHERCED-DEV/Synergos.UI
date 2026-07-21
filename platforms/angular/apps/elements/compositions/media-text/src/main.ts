import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { MediaTextComponent } from './media-text/media-text';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-media-text')) {
    const MediaTextElement = createCustomElement(MediaTextComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-media-text', MediaTextElement);
  }
});
