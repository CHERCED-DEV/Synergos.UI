import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CountdownClockElementComponent } from './countdown-clock/countdown-clock';

registrarElementoAngular('synergos-countdown-clock', CountdownClockElementComponent, appConfig);
