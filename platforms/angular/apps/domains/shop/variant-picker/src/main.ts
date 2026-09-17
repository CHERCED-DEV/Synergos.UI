import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { VariantPickerComponent } from '@synergos/shop';

registrarElementoAngular('synergos-variant-picker', VariantPickerComponent, appConfig);
