import { registrarElementoAngular } from '@synergos/core';
import { definirCoordinador } from '@synergos/vitals-core';
import { appConfig } from './app.config';
import { AlquilerElementComponent } from './alquiler/alquiler';

// El coordinador de la renta (<synergos-flujo>, ADR 0140 F4) lo define el participante al cargar
// su bundle, y ANTES de registrarse: así ningún pedido llega antes que su oyente. Es idempotente
// (la primera definición gana) y es la excepción escrita a la obligación 8 de la plataforma.
definirCoordinador();
registrarElementoAngular('synergos-alquiler', AlquilerElementComponent, appConfig);
