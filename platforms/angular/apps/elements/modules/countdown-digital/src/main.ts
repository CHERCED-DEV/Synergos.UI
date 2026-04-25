import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CountdownDigitalElementComponent } from './countdown-digital/countdown-digital';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-countdown-digital')) {
    const CountdownDigitalElement = createCustomElement(CountdownDigitalElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-countdown-digital', CountdownDigitalElement);
  }
});
