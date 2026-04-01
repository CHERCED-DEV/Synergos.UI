import { TestBed } from '@angular/core/testing';
import { EventBusService } from './event-bus.service';

class BroadcastChannelMock {
  static readonly instances: BroadcastChannelMock[] = [];

  readonly postedMessages: unknown[] = [];
  #listener: ((event: MessageEvent) => void) | null = null;

  constructor(public readonly name: string) {
    BroadcastChannelMock.instances.push(this);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.#listener = listener;
  }

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
    this.#listener?.({ data: message } as MessageEvent);
  }
}

describe(EventBusService.name, () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(() => {
    BroadcastChannelMock.instances.length = 0;
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: BroadcastChannelMock,
    });

    TestBed.configureTestingModule({
      providers: [EventBusService],
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: originalBroadcastChannel,
    });
  });

  it('publishes events to the broadcast channel', () => {
    const service = TestBed.inject(EventBusService);

    service.publish({ type: 'modal-opened', payload: { id: 'hero' } });

    expect(service.lastEvent()?.type).toBe('modal-opened');
    expect(BroadcastChannelMock.instances[0]?.postedMessages).toHaveLength(1);
  });
});
