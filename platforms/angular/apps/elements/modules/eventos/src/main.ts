import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { EventosElementComponent } from './eventos/eventos';

registrarElementoAngular('synergos-eventos', EventosElementComponent, appConfig);
