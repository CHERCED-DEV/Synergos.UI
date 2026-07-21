import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { AvatarUploadElementComponent } from './avatar-upload/avatar-upload';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-avatar-upload')) {
    const AvatarUploadElement = createCustomElement(AvatarUploadElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-avatar-upload', AvatarUploadElement);
  }
});
