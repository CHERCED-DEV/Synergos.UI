import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { VideoBlockComponent } from './video-block/video-block';

registrarElementoAngular('synergos-video-block', VideoBlockComponent, appConfig);
