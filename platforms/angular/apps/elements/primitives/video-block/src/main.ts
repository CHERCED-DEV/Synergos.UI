import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { VideoBlockComponent } from './video-block/video-block';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-video-block')) {
    const VideoBlockElement = createCustomElement(VideoBlockComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-video-block', VideoBlockElement);
  }
});
