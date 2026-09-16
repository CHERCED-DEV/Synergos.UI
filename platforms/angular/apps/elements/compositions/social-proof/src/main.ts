import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SocialProofElementComponent } from './social-proof/social-proof';

registrarElementoAngular('synergos-social-proof', SocialProofElementComponent, appConfig);
