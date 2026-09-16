import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TabGroupElementComponent } from './tab-group/tab-group';

registrarElementoAngular('synergos-tab-group', TabGroupElementComponent, appConfig);
