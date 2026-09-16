import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { InfoBlockComponent } from './info-block/info-block';

registrarElementoAngular('synergos-info-block', InfoBlockComponent, appConfig);
