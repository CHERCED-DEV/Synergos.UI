import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { AvatarGroupElementComponent } from './avatar-group/avatar-group';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-avatar-group')) {
    const AvatarGroupElement = createCustomElement(AvatarGroupElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-avatar-group', AvatarGroupElement);
  }
});
