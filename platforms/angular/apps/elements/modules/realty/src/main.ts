import { registrarElementoAngular } from '@synergos/core';
import { definirCoordinador } from '@synergos/vitals-core';
import { appConfig } from './app.config';
import { RealtyElementComponent } from './realty/realty';

// El coordinador de la visita (<synergos-flujo>, ADR 0140 F4; 008-propiedades-visita) lo define el participante al
// cargar su bundle, y ANTES de registrarse: así ningún pedido llega antes que su oyente. Es idempotente (la primera
// definición gana) y es la excepción escrita a la obligación 8 de la plataforma, como en la reserva.
definirCoordinador();
registrarElementoAngular('synergos-realty', RealtyElementComponent, appConfig);
