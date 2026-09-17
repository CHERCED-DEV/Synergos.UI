import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { MapPinElementComponent } from './map-pin/map-pin';

registrarElementoAngular('synergos-map-pin', MapPinElementComponent, appConfig);
