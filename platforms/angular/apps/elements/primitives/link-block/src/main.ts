import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { LinkBlockComponent } from './link-block/link-block';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-link-block')) {
    const LinkBlockElement = createCustomElement(LinkBlockComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-link-block', LinkBlockElement);
  }
});
