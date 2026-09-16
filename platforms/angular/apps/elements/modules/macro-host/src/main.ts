import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { MacroHostComponent } from './macro-host/macro-host';

registrarElementoAngular('synergos-macro-host', MacroHostComponent, appConfig);
