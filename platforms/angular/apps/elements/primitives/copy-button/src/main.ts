import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CopyButtonElementComponent } from './copy-button/copy-button';

registrarElementoAngular('synergos-copy-button', CopyButtonElementComponent, appConfig);
