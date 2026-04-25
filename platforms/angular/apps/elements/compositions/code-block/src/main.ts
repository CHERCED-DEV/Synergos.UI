import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CodeBlockElementComponent } from './code-block/code-block';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-code-block')) {
    const CodeBlockElement = createCustomElement(CodeBlockElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-code-block', CodeBlockElement);
  }
});
