import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AngularHostElementComponent } from './angular-host/angular-host';

registrarElementoAngular('synergos-angular-host', AngularHostElementComponent, appConfig);
