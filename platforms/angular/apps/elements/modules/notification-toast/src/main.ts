import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { NotificationToastElementComponent } from './notification-toast/notification-toast';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-notification-toast')) {
    const NotificationToastElement = createCustomElement(NotificationToastElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-notification-toast', NotificationToastElement);
  }
});
