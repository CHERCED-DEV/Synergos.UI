import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { LogoItemElementComponent } from './logo-item/logo-item';

registrarElementoAngular('synergos-logo-item', LogoItemElementComponent, appConfig);
