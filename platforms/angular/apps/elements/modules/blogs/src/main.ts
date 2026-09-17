import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { BlogsElementComponent } from './blogs/blogs';

registrarElementoAngular('synergos-blogs', BlogsElementComponent, appConfig);
