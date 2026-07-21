import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { OembedElementComponent } from './oembed/oembed';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-oembed')) {
    const OembedElement = createCustomElement(OembedElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-oembed', OembedElement);
  }
});
