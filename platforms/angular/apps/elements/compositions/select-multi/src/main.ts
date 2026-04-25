import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SelectMultiElementComponent } from './select-multi/select-multi';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-select-multi')) {
    const SelectMultiElement = createCustomElement(SelectMultiElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-select-multi', SelectMultiElement);
  }
});
