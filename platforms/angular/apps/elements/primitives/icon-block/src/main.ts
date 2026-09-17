import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { IconBlockComponent } from './icon-block/icon-block';

registrarElementoAngular('synergos-icon-block', IconBlockComponent, appConfig);
