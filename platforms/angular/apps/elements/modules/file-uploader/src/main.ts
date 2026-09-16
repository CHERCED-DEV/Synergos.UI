import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { FileUploaderElementComponent } from './file-uploader/file-uploader';

registrarElementoAngular('synergos-file-uploader', FileUploaderElementComponent, appConfig);
