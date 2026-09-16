import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { DatePickerElementComponent } from './date-picker/date-picker';

registrarElementoAngular('synergos-date-picker', DatePickerElementComponent, appConfig);
