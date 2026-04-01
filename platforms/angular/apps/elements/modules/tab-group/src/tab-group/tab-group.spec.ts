import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabGroupElementComponent } from './tab-group';

describe('TabGroupElementComponent', () => {
  let fixture: ComponentFixture<TabGroupElementComponent>;
  let component: TabGroupElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabGroupElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TabGroupElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"title":"Account","tabs":[{"id":"profile","label":"Profile","content":"Body"}],"theme":"dark"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Account');
    expect(component.parsedTabs()[0]?.id).toBe('profile');
    expect(component.theme()).toBe('dark');
  });

  it('should parse direct json tabs input', async () => {
    fixture.componentRef.setInput('tabs', '[{"id":"a","label":"A","content":"One"}]');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedTabs()).toEqual([{ id: 'a', label: 'A', content: 'One', disabled: false }]);
  });
});
