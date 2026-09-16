import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ModalTriggerElementComponent } from './modal-trigger/modal-trigger';

registrarElementoAngular('synergos-modal-trigger', ModalTriggerElementComponent, appConfig);
