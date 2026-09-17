import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { VideoPlayerElementComponent } from './video-player/video-player';

registrarElementoAngular('synergos-video-player', VideoPlayerElementComponent, appConfig);
