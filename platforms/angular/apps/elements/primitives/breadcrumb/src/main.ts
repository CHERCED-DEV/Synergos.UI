import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { BreadcrumbElementComponent } from './breadcrumb/breadcrumb';

registrarElementoAngular('synergos-breadcrumb', BreadcrumbElementComponent, appConfig);
