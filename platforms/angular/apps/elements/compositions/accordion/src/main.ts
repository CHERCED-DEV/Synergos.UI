import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AccordionElementComponent } from './accordion/accordion';

registrarElementoAngular('synergos-accordion', AccordionElementComponent, appConfig);
