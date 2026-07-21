import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { MediaExplorerComponent } from './media-explorer/interface/media-explorer';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-media-explorer')) {
    const MediaExplorerElement = createCustomElement(MediaExplorerComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-media-explorer', MediaExplorerElement);
  }
});
