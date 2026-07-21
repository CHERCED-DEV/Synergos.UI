import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { LogoItemElementComponent } from './logo-item/logo-item';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-logo-item')) {
    const LogoItemElement = createCustomElement(LogoItemElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-logo-item', LogoItemElement);
  }
});
