import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SocialShareElementComponent } from './social-share/social-share';

registrarElementoAngular('synergos-social-share', SocialShareElementComponent, appConfig);
