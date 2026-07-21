import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SocialProofElementComponent } from './social-proof/social-proof';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-social-proof')) {
    const SocialProofElement = createCustomElement(SocialProofElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-social-proof', SocialProofElement);
  }
});
