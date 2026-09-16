import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SeatMapElementComponent } from './seat-map/seat-map';

registrarElementoAngular('synergos-seat-map', SeatMapElementComponent, appConfig);
