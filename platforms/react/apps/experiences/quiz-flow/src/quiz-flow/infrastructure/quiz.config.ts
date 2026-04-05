export interface QuizConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly questions?: ReadonlyArray<{
    readonly text?: string;
    readonly options?: readonly string[];
    readonly correct?: number;
  }>;
  readonly theme?: string;
}
