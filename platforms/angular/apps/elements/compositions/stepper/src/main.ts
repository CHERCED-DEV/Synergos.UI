import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { StepperElementComponent } from './stepper/stepper';

registrarElementoAngular('synergos-stepper', StepperElementComponent, appConfig);
