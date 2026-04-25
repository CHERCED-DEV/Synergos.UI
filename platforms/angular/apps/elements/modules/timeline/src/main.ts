import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TimelineElementComponent } from './timeline/timeline';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-timeline')) {
    const TimelineElement = createCustomElement(TimelineElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-timeline', TimelineElement);
  }
});
