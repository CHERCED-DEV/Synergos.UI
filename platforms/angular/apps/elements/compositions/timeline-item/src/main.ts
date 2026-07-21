import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { TimelineItemElementComponent } from './timeline-item/timeline-item';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-timeline-item')) {
    const TimelineItemElement = createCustomElement(TimelineItemElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-timeline-item', TimelineItemElement);
  }
});
