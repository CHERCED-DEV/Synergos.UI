import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CountdownClockElementComponent } from './countdown-clock/countdown-clock';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-countdown-clock')) {
    const CountdownClockElement = createCustomElement(CountdownClockElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-countdown-clock', CountdownClockElement);
  }
});
