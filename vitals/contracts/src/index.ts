export * from './shared.contract';
export * from './compositions.contract';
export * from './element-config.contract';
export * from './embed.contract';
export * from './page-config.contract';
export * from './elements.contract';
export * from './elements-syn.contract';
export * from './elementos-synhost.contract';
export * from './rendering.contract';
export * from './element-manifest.schema';
export * from './component-resolution.contract';
export * from './form.contract';
export * from './flow.contract';
export * from './host-bridge.contract';
export * from './shop.contract';
// El contrato HTTP de los orquestadores (ADR 0140, F2), generado por tools/contrato-http.mjs: un
// espacio de nombres por orquestador. No lo importa nadie hasta la F4 (regla 24, abierta con fecha).
export * from './http';
export { default as ELEMENT_REGISTRY } from './element-registry.json';
