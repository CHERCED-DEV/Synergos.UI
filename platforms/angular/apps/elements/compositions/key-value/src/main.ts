import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { KeyValueElementComponent } from './key-value/key-value';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-key-value')) {
    const KeyValueElement = createCustomElement(KeyValueElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-key-value', KeyValueElement);
  }
});
