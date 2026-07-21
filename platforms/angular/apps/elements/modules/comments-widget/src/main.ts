import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CommentsWidgetElementComponent } from './comments-widget/comments-widget';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-comments-widget')) {
    const CommentsWidgetElement = createCustomElement(CommentsWidgetElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-comments-widget', CommentsWidgetElement);
  }
});
