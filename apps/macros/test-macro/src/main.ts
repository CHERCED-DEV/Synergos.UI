import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TestMacroComponent } from './test-macro/test-macro';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('sg-test-macro')) {
    const TestMacroElement = createCustomElement(TestMacroComponent, {
      injector: appRef.injector,
    });
    customElements.define('sg-test-macro', TestMacroElement);
  }
});
