import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { ScriptEmbedElementComponent } from './script-embed/script-embed';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-script-embed')) {
    const ScriptEmbedElement = createCustomElement(ScriptEmbedElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-script-embed', ScriptEmbedElement);
  }
});
