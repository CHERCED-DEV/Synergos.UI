import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { AudioPlayerElementComponent } from './audio-player/audio-player';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-audio-player')) {
    const AudioPlayerElement = createCustomElement(AudioPlayerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-audio-player', AudioPlayerElement);
  }
});
