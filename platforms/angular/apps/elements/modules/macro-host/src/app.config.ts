import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideElementRegistry, type RegistryEntry } from '@synergos/rendering';
import { ELEMENT_REGISTRY } from '@synergos/contracts';

// JSON imports widen `tier` a string. RegistryEntry exige
// `ComponentTier | undefined` (literal union). Cast surgical — los
// valores reales del JSON son los literales correctos por construcción
// del cms-sync.mjs generator.
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    provideElementRegistry(ELEMENT_REGISTRY as RegistryEntry[]),
  ],
};
