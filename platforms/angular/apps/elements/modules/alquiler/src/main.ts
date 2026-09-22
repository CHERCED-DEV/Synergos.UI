import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AlquilerElementComponent } from './alquiler/alquiler';

registrarElementoAngular('synergos-alquiler', AlquilerElementComponent, appConfig);
