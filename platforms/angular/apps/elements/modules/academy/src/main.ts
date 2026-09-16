import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AcademyElementComponent } from './academy/academy';

registrarElementoAngular('synergos-academy', AcademyElementComponent, appConfig);
