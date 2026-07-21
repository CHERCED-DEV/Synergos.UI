import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ModalTriggerElementComponent } from './modal-trigger/modal-trigger';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-modal-trigger')) {
    const ModalTriggerElement = createCustomElement(ModalTriggerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-modal-trigger', ModalTriggerElement);
  }
});
