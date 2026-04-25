import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { NotificationCenterElementComponent } from './notification-center/notification-center';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-notification-center')) {
    const NotificationCenterElement = createCustomElement(NotificationCenterElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-notification-center', NotificationCenterElement);
  }
});
