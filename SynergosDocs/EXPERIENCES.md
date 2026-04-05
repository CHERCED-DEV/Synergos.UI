# Synergos Experiences

Experiences are complex interactive Web Components that go beyond the static element catalog. They implement multi-step flows, reactive state, timers, filters, and user interaction patterns that justify their own independent bundles.

---

## Catalog

### Angular Experiences

| Name | Tag | Description |
|------|-----|-------------|
| `feature-journey` | `synergos-feature-journey` | 5-step visual journey through the Synergos build process |
| `insight-explorer` | `synergos-insight-explorer` | Data exploration widget with signal-driven filtering |
| `media-explorer` | `synergos-media-explorer` | Browsable media gallery with categorized view |

### React Experiences

| Name | Tag | Description | Key patterns |
|------|-----|-------------|-------------|
| `content-carousel` | `synergos-content-carousel` | Sliding carousel with autoplay, dot navigation | `useCarouselState`, `useEffect` timer |
| `quiz-flow` | `synergos-quiz-flow` | Multi-phase quiz (intro → quiz → results) | `useReducer` state machine, score evaluation |

### Svelte Experiences

| Name | Tag | Description | Key patterns |
|------|-----|-------------|-------------|
| `rating-widget` | `synergos-rating-widget` | Star rating with hover preview and submit | `$state`, `$derived`, `$derived.by` runes |
| `filter-board` | `synergos-filter-board` | Tag-filtered card grid with per-tag counts | `$state activeTag`, `$derived filteredItems` |

### Vanilla JS Experiences

| Name | Tag | Description | Key patterns |
|------|-----|-------------|-------------|
| `notification-stack` | `synergos-notification-stack` | Auto-dismissing notification stack | Observer-pattern `NotificationState`, `setTimeout` |
| `countdown-clock` | `synergos-countdown-clock` | Live countdown to a target date | `CountdownState` + `setInterval`, `calculateRemaining` |

---

## Architecture Pattern

Every experience — in every framework — follows the same 4-layer folder structure:

```
src/<experience-name>/
├── domain/           → Pure types, constants, pure functions. Zero framework deps.
├── application/      → State and business logic. Framework-idiomatic.
├── infrastructure/   → Config interface + adapter (CMS raw data → domain model).
└── interface/        → UI component (Angular .ts, React .tsx, Svelte .svelte, Vanilla .ts)
```

### Why this structure?

| Layer | Rule | Benefit |
|-------|------|---------|
| `domain/` | No imports except standard TS | Testable in any environment |
| `application/` | No HTTP, no DOM, no framework UI | Isolated state logic |
| `infrastructure/` | No state, only transforms | CMS contract changes stay here |
| `interface/` | No business rules, only rendering | UI framework can be swapped |

### The `config` contract

All experiences accept a single `config` JSON attribute. The CMS serializes a structured payload into this attribute:

```html
<synergos-quiz-flow config='{"title":"Knowledge Test","questions":[...]}'></synergos-quiz-flow>
```

The **infrastructure adapter** (`<name>.adapter.ts`) is the single place that translates the raw CMS object into the typed domain model the component uses.

---

## Angular Experience

Full example: `platforms/angular/apps/experiences/feature-journey/`

```
src/feature-journey/
├── domain/
│   ├── models/journey-step.model.ts      → JourneyStep interface
│   └── journey.domain.ts                 → JOURNEY_STEPS constant
├── application/
│   ├── journey.state.ts                  → JourneyState class (Angular signals)
│   └── use-cases/navigate-step.ts        → nextStep, prevStep, goToStep functions
├── infrastructure/
│   ├── feature-journey.config.ts         → FeatureJourneyConfig interface
│   └── feature-journey.adapter.ts        → adaptFeatureJourneyConfig()
└── interface/
    ├── feature-journey.ts                → @Component — OnPush, signals, no BehaviorSubject
    ├── feature-journey.html
    └── feature-journey.scss
```

State uses Angular signals (`signal()`, `computed()`). Component reads only from state:

```typescript
readonly steps = this.#state.steps;
readonly activeStep = this.#state.activeStep;
readonly progress = this.#state.progress;

next(): void { nextStep(this.#state); }
```

---

## React Experience

Full example: `platforms/react/apps/experiences/quiz-flow/`

```
src/quiz-flow/
├── index.ts
├── domain/
│   └── quiz.domain.ts          → QuizPhase, QuizQuestion, evaluateAnswers()
├── application/
│   └── quiz.state.ts           → useQuizState() hook (useReducer)
├── infrastructure/
│   ├── quiz.config.ts          → QuizConfig interface
│   └── quiz.adapter.ts         → adaptQuizConfig()
└── interface/
    └── QuizFlow.tsx             → React FC, useLogger hook, inline styles in <style>
```

State uses `useReducer` for multi-phase machines:

```typescript
// application/quiz.state.ts
function quizReducer(state, action): QuizStateInternal {
  switch (action.type) {
    case 'START':   return { phase: 'quiz', currentIndex: 0, answers: [] };
    case 'ANSWER':  return { ...nextAnswers, phase: nextPhase };
    case 'RESTART': return { phase: 'intro', currentIndex: 0, answers: [] };
  }
}

export function useQuizState(questions: QuizQuestion[]): QuizState {
  const [state, dispatch] = useReducer(quizReducer, initialState);
  const score = evaluateAnswers(questions, state.answers);
  return { ...state, score, start, answer, restart };
}
```

The component uses `useLogger` (React hook, not `createLogger`):

```tsx
export function QuizFlow({ config = '' }: QuizFlowProps) {
  const logger = useLogger('quiz-flow');
  // ...
}
```

---

## Svelte Experience

Full example: `platforms/svelte/apps/experiences/filter-board/`

```
src/filter-board/
├── main.ts                               → import './filter-board/interface/FilterBoard.svelte'
├── filter-board/
│   ├── domain/
│   │   └── filter.domain.ts             → FilterItem, getAllTags(), filterByTag()
│   ├── application/
│   │   └── filter.logic.ts              → countByTag() (pure function)
│   ├── infrastructure/
│   │   ├── filter.config.ts             → FilterConfig interface
│   │   └── filter.adapter.ts            → adaptFilterConfig()
│   └── interface/
│       └── FilterBoard.svelte           → <svelte:options customElement="...">, Svelte 5 runes
```

Svelte runes replace the explicit state class:

```svelte
<!-- interface/FilterBoard.svelte -->
<svelte:options customElement="synergos-filter-board" />

<script lang="ts">
  let { config = '' }: { config?: string } = $props();

  const instance = $derived.by(() => adaptFilterConfig(JSON.parse(config || '{}')));
  let activeTag = $state<string | null>(null);
  const filteredItems = $derived(filterByTag(instance.items, activeTag));
  const allTags = $derived(getAllTags(instance.items));
</script>
```

The `main.ts` entry just imports the `.svelte` file (Svelte's compiler registers the custom element automatically):

```typescript
import './filter-board/interface/FilterBoard.svelte';
```

---

## Vanilla JS Experience

Full example: `platforms/vanilla/apps/experiences/countdown-clock/`

```
src/countdown-clock/
├── main.ts                                   → HTMLElement subclass, full lifecycle
├── countdown-clock/
│   ├── domain/
│   │   └── countdown.domain.ts              → TimeRemaining, calculateRemaining()
│   ├── application/
│   │   └── countdown.state.ts               → CountdownState class (setInterval, pub-sub)
│   ├── infrastructure/
│   │   ├── countdown.config.ts              → CountdownConfig interface
│   │   └── countdown.adapter.ts             → adaptCountdownConfig()
│   └── interface/
│       └── countdown-clock.ts               → render(host, state, label, theme): () => void
```

The `render` function returns a cleanup function — no class, no hooks, pure function:

```typescript
// interface/countdown-clock.ts
export function render(host: ShadowRoot, state: CountdownState, label: string, theme: string): () => void {
  function update(remaining: TimeRemaining): void {
    host.innerHTML = buildHTML(remaining, label, theme);
  }
  update(state.current);
  const unsubscribe = state.subscribe(update);
  const stopInterval = state.start();
  return () => { unsubscribe(); stopInterval(); };
}
```

The custom element in `main.ts` stores and calls the cleanup:

```typescript
#mount() {
  const state = new CountdownState(targetDate);
  this.#cleanup = render(this.#shadow, state, label, theme);
}
disconnectedCallback() { this.#cleanup?.(); this.#cleanup = null; }
```

---

## Creating a New Experience

### 1. Register in the agnostic layer

**`vitals/contracts/src/element-registry.json`** — add entry with `tier: "module"`:
```json
{ "name": "my-experience", "alias": "experienceMyExperience", "tag": "synergos-my-experience", "tier": "module" }
```

**`vitals/contracts/src/element-inputs.json`** — declare single `config` input:
```json
"my-experience": [{ "name": "config", "type": "json", "required": false }]
```

**`vitals/contracts/src/element-config.contract.ts`** — add config interface + ELEMENT_CONFIG_FIELDS entry + ElementConfigMap entry.

**`vitals/core/src/models/my-experience-inputs.model.ts`**:
```typescript
export interface MyExperienceInputs { config?: string; }
```

**`vitals/core/src/mappers/my-experience.mapper.ts`**:
```typescript
export function mapMyExperienceData(data: Record<string, unknown>): MyExperienceInputs {
  return { config: JSON.stringify(data) };
}
```

Export from both `vitals/core/src/models/index.ts` and `vitals/core/src/mappers/index.ts`.

Add to `REGISTRY` in `vitals/core/src/mappers/block.mapper.ts`.

### 2. Run the contract audit

```bash
npm run element:audit
# Must show: Contract audit passed.
```

### 3. Create the framework project

Pick the framework that best fits the experience. Do **not** duplicate an experience already in another framework.

```
platforms/<framework>/apps/experiences/<experience-name>/
├── project.json    → Nx config, build/serve/test/lint targets
└── src/
    ├── main.ts(x)          → Custom Element registration
    └── <experience-name>/
        ├── index.ts         → re-export from interface layer
        ├── domain/
        ├── application/
        ├── infrastructure/
        └── interface/
```

**`project.json`** tags:
```json
["scope:experiences", "tier:module", "type:app", "element:<name>", "framework:<framework>"]
```

### 4. Build and verify

```bash
# Build just the new experience
npx nx run <framework>-<experience-name>:build

# Or build all cross-framework experiences
npm run build:experiences:cross

# Dry-run publish to check CDN targeting
node tools/publish.mjs --dry-run --element <experience-name>
```

---

## No-duplication rule

Before creating an experience, check the catalog above. If an experience with similar functionality exists in another framework:
- Extend the existing one instead of duplicating
- If a genuinely different UX is needed, document the distinction and use a different element name

---

## Related Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design, dependency rules
- [BUILD_PIPELINE.md](BUILD_PIPELINE.md) — Experience build commands
- [ELEMENT_CONTRACT.md](ELEMENT_CONTRACT.md) — Contract audit, registry, inputs
- [CDN_RUNTIME.md](CDN_RUNTIME.md) — Angular runtime (experiences included in build)
