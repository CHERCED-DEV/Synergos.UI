import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AvatarGroupElementComponent } from './avatar-group/avatar-group';

registrarElementoAngular('synergos-avatar-group', AvatarGroupElementComponent, appConfig);
