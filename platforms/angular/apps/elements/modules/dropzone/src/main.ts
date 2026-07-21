import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { DropzoneElementComponent } from './dropzone/dropzone';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-dropzone')) {
    const DropzoneElement = createCustomElement(DropzoneElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-dropzone', DropzoneElement);
  }
});
