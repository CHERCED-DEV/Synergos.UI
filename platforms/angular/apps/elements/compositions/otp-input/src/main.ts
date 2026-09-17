import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { OtpInputElementComponent } from './otp-input/otp-input';

registrarElementoAngular('synergos-otp-input', OtpInputElementComponent, appConfig);
