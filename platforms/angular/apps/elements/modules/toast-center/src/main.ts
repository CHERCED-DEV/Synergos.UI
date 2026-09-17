import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ToastCenterElementComponent } from './toast-center/toast-center';

registrarElementoAngular('synergos-toast-center', ToastCenterElementComponent, appConfig);
