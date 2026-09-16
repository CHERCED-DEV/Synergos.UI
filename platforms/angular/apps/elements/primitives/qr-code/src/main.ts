import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { QrCodeElementComponent } from './qr-code/qr-code';

registrarElementoAngular('synergos-qr-code', QrCodeElementComponent, appConfig);
