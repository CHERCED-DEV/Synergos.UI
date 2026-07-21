import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TimelineHorizontalElementComponent } from './timeline-horizontal/timeline-horizontal';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-timeline-horizontal')) {
    const TimelineHorizontalElement = createCustomElement(TimelineHorizontalElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-timeline-horizontal', TimelineHorizontalElement);
  }
});
