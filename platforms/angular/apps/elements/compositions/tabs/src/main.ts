import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TabsElementComponent } from './tabs/tabs';

registrarElementoAngular('synergos-tabs', TabsElementComponent, appConfig);
