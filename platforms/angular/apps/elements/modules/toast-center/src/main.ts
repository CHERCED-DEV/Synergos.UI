import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ToastCenterElementComponent } from './toast-center/toast-center';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-toast-center')) {
    const ToastCenterElement = createCustomElement(ToastCenterElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-toast-center', ToastCenterElement);
  }
});
