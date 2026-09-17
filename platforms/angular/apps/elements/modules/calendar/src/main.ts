import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CalendarElementComponent } from './calendar/calendar';

registrarElementoAngular('synergos-calendar', CalendarElementComponent, appConfig);
