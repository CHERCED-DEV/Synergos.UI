import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CookieConsentElementComponent } from './cookie-consent/cookie-consent';

registrarElementoAngular('synergos-cookie-consent', CookieConsentElementComponent, appConfig);
