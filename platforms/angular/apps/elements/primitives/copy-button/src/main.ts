import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { CopyButtonElementComponent } from './copy-button/copy-button';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-copy-button')) {
    const CopyButtonElement = createCustomElement(CopyButtonElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-copy-button', CopyButtonElement);
  }
});
