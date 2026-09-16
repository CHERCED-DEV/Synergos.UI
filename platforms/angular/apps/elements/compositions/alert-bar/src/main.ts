import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AlertBarElementComponent } from './alert-bar/alert-bar';

registrarElementoAngular('synergos-alert-bar', AlertBarElementComponent, appConfig);
