import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { HeroComponent } from './hero/hero';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-hero')) {
    const HeroElement = createCustomElement(HeroComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-hero', HeroElement);
  }
});
