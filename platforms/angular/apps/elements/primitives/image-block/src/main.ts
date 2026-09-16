import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ImageBlockComponent } from './image-block/image-block';

registrarElementoAngular('synergos-image-block', ImageBlockComponent, appConfig);
