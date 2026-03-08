import { TestBed } from '@angular/core/testing';
import { LoggerService } from './logger.service';

describe(LoggerService.name, () => {
  let service: LoggerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService],
    });

    service = TestBed.inject(LoggerService);
  });

  it('creates the logger service', () => {
    expect(service).toBeTruthy();
  });

  it('writes info messages with Synergos prefix', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    service.info('boot');

    expect(infoSpy).toHaveBeenCalledWith('[syn:info] boot');
  });
});
