import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  PollElementComponent,
  type PollVoteDetail,
  computeResults,
  normalizeOptions,
} from './poll';

const OPTIONS = JSON.stringify([
  { id: 'a', label: 'Angular', votes: 3 },
  { id: 'b', label: 'React', votes: 1 },
  { label: 'Svelte' },
  { label: '   ' },
  { id: 'a', label: 'Duplicado descartado' },
]);

describe('PollElementComponent', () => {
  let fixture: ComponentFixture<PollElementComponent>;
  let component: PollElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PollElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PollElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render with no options (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasOptions()).toBe(false);
    expect(component.hasVoted()).toBe(false);
    expect(component.options().length).toBe(0);
    expect(component.totalVotes()).toBe(0);
  });

  it('should render question + normalized options with percentages (render/config case)', async () => {
    fixture.componentRef.setInput('question', '¿Tu framework favorito?');
    fixture.componentRef.setInput('optionsJson', OPTIONS);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.question()).toBe('¿Tu framework favorito?');
    // 3 valid options survive: a (3), b (1), Svelte (0); blank + duplicate dropped.
    expect(component.options().length).toBe(3);
    expect(component.totalVotes()).toBe(4);

    const results = component.results();
    expect(results.find((r) => r.id === 'a')?.percent).toBe(75);
    expect(results.find((r) => r.id === 'b')?.percent).toBe(25);
    expect(results.find((r) => r.id === 'Svelte')?.percent).toBe(0);
  });

  it('should cast a vote, switch to results and emit pollvote (interaction case)', async () => {
    fixture.componentRef.setInput('optionsJson', OPTIONS);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: PollVoteDetail | undefined;
    component.pollvote.subscribe((detail) => (emitted = detail));

    const react = component.options().find((option) => option.id === 'b');
    expect(react).toBeDefined();
    component.vote(react!);

    expect(component.hasVoted()).toBe(true);
    expect(component.votedOptionId()).toBe('b');
    expect(component.isVoted(component.options()[1])).toBe(true);
    // b had 1 vote, +1 local = 2 of total 5 = 40%.
    expect(component.totalVotes()).toBe(5);
    expect(component.results().find((r) => r.id === 'b')?.percent).toBe(40);
    expect(emitted?.optionId).toBe('b');
    expect(emitted?.totalVotes).toBe(5);
  });

  it('should ignore further votes once voted (idempotent case)', async () => {
    fixture.componentRef.setInput('optionsJson', OPTIONS);
    fixture.detectChanges();
    await fixture.whenStable();

    const angular = component.options().find((option) => option.id === 'a')!;
    component.vote(angular);
    const totalAfterFirst = component.totalVotes();
    const votedAfterFirst = component.votedOptionId();

    // Repeated votes (same or other option) must not change anything.
    component.vote(angular);
    component.vote(component.options().find((option) => option.id === 'b')!);

    expect(component.totalVotes()).toBe(totalAfterFirst);
    expect(component.votedOptionId()).toBe(votedAfterFirst);
  });

  it('should let direct inputs override config (precedence)', async () => {
    fixture.componentRef.setInput('config', '{"question":"Desde config","voteEndpoint":"/config-vote"}');
    fixture.componentRef.setInput('question', 'Desde atributo');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.question()).toBe('Desde atributo');
    expect(component.voteEndpoint()).toBe('/config-vote');
  });
});

describe('poll pure helpers', () => {
  it('normalizeOptions drops blanks + duplicates and coerces votes', () => {
    const options = normalizeOptions([
      { id: 'x', label: 'Uno', votes: 5 },
      'Dos',
      { label: '  ' },
      { id: 'x', label: 'Repetido' },
      { id: 'y', label: 'Tres', votes: -4 },
      42,
    ]);
    expect(options.length).toBe(3);
    expect(options[0]).toEqual({ id: 'x', label: 'Uno', votes: 5 });
    expect(options[1]).toEqual({ id: 'Dos', label: 'Dos', votes: 0 });
    expect(options[2].votes).toBe(0);
  });

  it('computeResults rounds shares and yields 0% with no votes', () => {
    const zero = computeResults([
      { id: 'a', label: 'A', votes: 0 },
      { id: 'b', label: 'B', votes: 0 },
    ]);
    expect(zero.every((r) => r.percent === 0)).toBe(true);

    const split = computeResults([
      { id: 'a', label: 'A', votes: 1 },
      { id: 'b', label: 'B', votes: 3 },
    ]);
    expect(split[0].percent).toBe(25);
    expect(split[1].percent).toBe(75);
  });
});
