import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { VideoPlayerElementComponent } from './video-player/video-player';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-video-player')) {
    const VideoPlayerElement = createCustomElement(VideoPlayerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-video-player', VideoPlayerElement);
  }
});
