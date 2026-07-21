import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CookieConsentElementComponent } from './cookie-consent/cookie-consent';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-cookie-consent')) {
    const CookieConsentElement = createCustomElement(CookieConsentElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-cookie-consent', CookieConsentElement);
  }
});
