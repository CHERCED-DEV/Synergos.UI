import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AudioPlayerElementComponent } from './audio-player/audio-player';

registrarElementoAngular('synergos-audio-player', AudioPlayerElementComponent, appConfig);
