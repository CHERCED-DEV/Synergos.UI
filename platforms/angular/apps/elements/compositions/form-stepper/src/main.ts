import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { FormStepperElementComponent } from './form-stepper/form-stepper';

registrarElementoAngular('synergos-form-stepper', FormStepperElementComponent, appConfig);
