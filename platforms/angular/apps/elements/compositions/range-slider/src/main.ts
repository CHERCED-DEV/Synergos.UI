import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { RangeSliderElementComponent } from './range-slider/range-slider';

registrarElementoAngular('synergos-range-slider', RangeSliderElementComponent, appConfig);
