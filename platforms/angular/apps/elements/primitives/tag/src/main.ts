import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TagElementComponent } from './tag/tag';

registrarElementoAngular('synergos-tag', TagElementComponent, appConfig);
