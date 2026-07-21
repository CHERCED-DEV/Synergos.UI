import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { FileUploaderElementComponent } from './file-uploader/file-uploader';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-file-uploader')) {
    const FileUploaderElement = createCustomElement(FileUploaderElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-file-uploader', FileUploaderElement);
  }
});
