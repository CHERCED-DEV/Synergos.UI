import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { NotificationCenterElementComponent } from './notification-center/notification-center';

registrarElementoAngular('synergos-notification-center', NotificationCenterElementComponent, appConfig);
