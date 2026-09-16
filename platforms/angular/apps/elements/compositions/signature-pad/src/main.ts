import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SignaturePadElementComponent } from './signature-pad/signature-pad';

registrarElementoAngular('synergos-signature-pad', SignaturePadElementComponent, appConfig);
