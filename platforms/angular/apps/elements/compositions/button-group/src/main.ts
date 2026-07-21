import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ButtonGroupComponent } from './button-group/button-group';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-button-group')) {
    const ButtonGroupElement = createCustomElement(ButtonGroupComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-button-group', ButtonGroupElement);
  }
});
