import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { RatingStarsElementComponent } from './rating-stars/rating-stars';

registrarElementoAngular('synergos-rating-stars', RatingStarsElementComponent, appConfig);
