import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ColorPickerElementComponent } from './color-picker/color-picker';

registrarElementoAngular('synergos-color-picker', ColorPickerElementComponent, appConfig);
