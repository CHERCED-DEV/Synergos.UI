import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ColorSwatchesElementComponent } from './color-swatches/color-swatches';

registrarElementoAngular('synergos-color-swatches', ColorSwatchesElementComponent, appConfig);
