import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CodeBlockElementComponent } from './code-block/code-block';

registrarElementoAngular('synergos-code-block', CodeBlockElementComponent, appConfig);
