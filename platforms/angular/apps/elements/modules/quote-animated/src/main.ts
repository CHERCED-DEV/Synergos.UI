import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { QuoteAnimatedElementComponent } from './quote-animated/quote-animated';

registrarElementoAngular('synergos-quote-animated', QuoteAnimatedElementComponent, appConfig);
