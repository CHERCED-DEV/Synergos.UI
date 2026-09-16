import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { RealtyElementComponent } from './realty/realty';

registrarElementoAngular('synergos-realty', RealtyElementComponent, appConfig);
