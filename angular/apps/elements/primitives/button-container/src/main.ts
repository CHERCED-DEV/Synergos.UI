import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ButtonContainerComponent } from './button-container/button-container';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-button-container')) {
    const ButtonContainerElement = createCustomElement(ButtonContainerComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-button-container', ButtonContainerElement);
  }
});
