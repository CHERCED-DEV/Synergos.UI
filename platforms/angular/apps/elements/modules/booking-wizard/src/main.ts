import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { BookingWizardElementComponent } from './booking-wizard/booking-wizard';

registrarElementoAngular('synergos-booking-wizard', BookingWizardElementComponent, appConfig);
