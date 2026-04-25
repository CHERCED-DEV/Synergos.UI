import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { QrCodeElementComponent } from './qr-code/qr-code';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-qr-code')) {
    const QrCodeElement = createCustomElement(QrCodeElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-qr-code', QrCodeElement);
  }
});
