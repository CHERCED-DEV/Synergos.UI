import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AvatarElementComponent } from './avatar/avatar';

registrarElementoAngular('synergos-avatar', AvatarElementComponent, appConfig);
