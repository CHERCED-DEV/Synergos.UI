import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { DropzoneElementComponent } from './dropzone/dropzone';

registrarElementoAngular('synergos-dropzone', DropzoneElementComponent, appConfig);
