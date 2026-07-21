import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { OtpInputElementComponent } from './otp-input/otp-input';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-otp-input')) {
    const OtpInputElement = createCustomElement(OtpInputElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-otp-input', OtpInputElement);
  }
});
