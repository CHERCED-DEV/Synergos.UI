import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TextBlockComponent } from './text-block/text-block';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-text-block')) {
    const TextBlockElement = createCustomElement(TextBlockComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-text-block', TextBlockElement);
  }
});
