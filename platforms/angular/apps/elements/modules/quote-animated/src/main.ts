import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { QuoteAnimatedElementComponent } from './quote-animated/quote-animated';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-quote-animated')) {
    const QuoteAnimatedElement = createCustomElement(QuoteAnimatedElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-quote-animated', QuoteAnimatedElement);
  }
});
