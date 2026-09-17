import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { NotificationToastElementComponent } from './notification-toast/notification-toast';

registrarElementoAngular('synergos-notification-toast', NotificationToastElementComponent, appConfig);
