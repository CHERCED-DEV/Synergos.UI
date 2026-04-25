import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SplitterElementComponent } from './splitter/splitter';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-splitter')) {
    const SplitterElement = createCustomElement(SplitterElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-splitter', SplitterElement);
  }
});
