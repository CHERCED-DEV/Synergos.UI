import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AppLauncherElementComponent } from './app-launcher/app-launcher';

registrarElementoAngular('synergos-app-launcher', AppLauncherElementComponent, appConfig);
