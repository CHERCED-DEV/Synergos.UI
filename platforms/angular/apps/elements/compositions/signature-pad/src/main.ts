import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SignaturePadElementComponent } from './signature-pad/signature-pad';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-signature-pad')) {
    const SignaturePadElement = createCustomElement(SignaturePadElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-signature-pad', SignaturePadElement);
  }
});
