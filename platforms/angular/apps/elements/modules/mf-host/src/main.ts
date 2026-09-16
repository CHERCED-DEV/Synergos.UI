import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { MfHostElementComponent } from './mf-host/mf-host';

registrarElementoAngular('synergos-mf-host', MfHostElementComponent, appConfig);
