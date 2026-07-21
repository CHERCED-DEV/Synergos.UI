import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { AppLauncherElementComponent } from './app-launcher/app-launcher';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-app-launcher')) {
    const AppLauncherElement = createCustomElement(AppLauncherElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-app-launcher', AppLauncherElement);
  }
});
