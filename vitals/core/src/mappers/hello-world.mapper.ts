import type { HelloWorldInputs } from '../models/hello-world-inputs.model';

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function mapHelloWorldData(data: Record<string, unknown>): HelloWorldInputs {
  return {
    heading: readString(data['heading']) || 'Hello, Synergos!',
    message: readString(data['message']),
    theme: readString(data['theme']) || 'light',
  };
}
