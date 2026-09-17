import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { DrawerElementComponent } from './drawer/drawer';

registrarElementoAngular('synergos-drawer', DrawerElementComponent, appConfig);
