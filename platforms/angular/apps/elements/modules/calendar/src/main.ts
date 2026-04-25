import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CalendarElementComponent } from './calendar/calendar';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-calendar')) {
    const CalendarElement = createCustomElement(CalendarElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-calendar', CalendarElement);
  }
});
