import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { DividerComponent } from './divider/divider';

registrarElementoAngular('synergos-divider', DividerComponent, appConfig);
