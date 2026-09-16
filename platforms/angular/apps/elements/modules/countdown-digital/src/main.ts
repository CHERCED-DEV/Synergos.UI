import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CountdownDigitalElementComponent } from './countdown-digital/countdown-digital';

registrarElementoAngular('synergos-countdown-digital', CountdownDigitalElementComponent, appConfig);
