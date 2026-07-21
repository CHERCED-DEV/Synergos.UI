import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { AvatarElementComponent } from './avatar/avatar';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-avatar')) {
    const AvatarElement = createCustomElement(AvatarElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-avatar', AvatarElement);
  }
});
