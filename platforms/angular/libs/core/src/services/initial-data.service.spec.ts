import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InitialDataService } from './initial-data.service';

describe(InitialDataService.name, () => {
  let service: InitialDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [InitialDataService],
    });

    service = TestBed.inject(InitialDataService);
  });

  it('parses data-config attributes', () => {
    const element = document.createElement('div');
    element.setAttribute('data-config', '{"title":"Hero"}');

    expect(service.parseAttribute<{ title: string }>(new ElementRef(element))).toEqual({
      title: 'Hero',
    });
  });

  it('returns null for invalid JSON', () => {
    const element = document.createElement('div');
    element.setAttribute('data-initial-value', '{invalid');

    expect(service.parseAttribute(new ElementRef(element))).toBeNull();
  });

  it('parses raw JSON values', () => {
    expect(service.parseValue<{ title: string }>('{"title":"Banner"}')).toEqual({
      title: 'Banner',
    });
  });

  it('returns null for empty raw values', () => {
    expect(service.parseValue('')).toBeNull();
    expect(service.parseValue(undefined)).toBeNull();
  });
});
