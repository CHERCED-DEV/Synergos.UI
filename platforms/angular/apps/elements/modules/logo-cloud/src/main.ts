import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { LogoCloudElementComponent } from './logo-cloud/logo-cloud';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-logo-cloud')) {
    const LogoCloudElement = createCustomElement(LogoCloudElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-logo-cloud', LogoCloudElement);
  }
});
