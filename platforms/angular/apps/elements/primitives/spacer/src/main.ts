import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SpacerComponent } from './spacer/spacer';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-spacer')) {
    const SpacerElement = createCustomElement(SpacerComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-spacer', SpacerElement);
  }
});
