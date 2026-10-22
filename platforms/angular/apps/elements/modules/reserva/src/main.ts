import { registrarElementoAngular } from '@synergos/core';
import { definirCoordinador } from '@synergos/vitals-core';
import { appConfig } from './app.config';
import { ReservaElementComponent } from './reserva/reserva';

// El coordinador de la reserva (<synergos-flujo>, ADR 0140 F4) lo define el participante al cargar
// su bundle, y ANTES de registrarse: así ningún pedido llega antes que su oyente. Es idempotente
// (la primera definición gana) y es la excepción escrita a la obligación 8 de la plataforma.
definirCoordinador();
registrarElementoAngular('synergos-reserva', ReservaElementComponent, appConfig);
