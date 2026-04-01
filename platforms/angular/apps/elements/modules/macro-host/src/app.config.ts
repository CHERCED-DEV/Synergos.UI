import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideElementRegistry } from '@synergos/rendering';
import { ELEMENT_REGISTRY } from '@synergos/contracts';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    provideElementRegistry(ELEMENT_REGISTRY),
  ],
};
