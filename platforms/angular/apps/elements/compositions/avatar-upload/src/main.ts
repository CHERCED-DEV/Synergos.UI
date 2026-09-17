import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AvatarUploadElementComponent } from './avatar-upload/avatar-upload';

registrarElementoAngular('synergos-avatar-upload', AvatarUploadElementComponent, appConfig);
