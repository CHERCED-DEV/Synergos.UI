import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { FabElementComponent } from './fab/fab';

registrarElementoAngular('synergos-fab', FabElementComponent, appConfig);
