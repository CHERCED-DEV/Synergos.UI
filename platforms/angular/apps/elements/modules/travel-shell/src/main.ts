import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TravelShellElementComponent } from './travel-shell/travel-shell';

registrarElementoAngular('synergos-travel-shell', TravelShellElementComponent, appConfig);
