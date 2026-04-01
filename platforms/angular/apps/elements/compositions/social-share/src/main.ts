import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { SocialShareElementComponent } from './social-share/social-share';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-social-share')) {
    const SocialShareElement = createCustomElement(SocialShareElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-social-share', SocialShareElement);
  }
});
