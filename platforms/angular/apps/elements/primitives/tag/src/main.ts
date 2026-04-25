import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TagElementComponent } from './tag/tag';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-tag')) {
    const TagElement = createCustomElement(TagElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-tag', TagElement);
  }
});
