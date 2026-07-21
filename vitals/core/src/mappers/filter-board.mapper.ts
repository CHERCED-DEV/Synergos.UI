import type { FilterBoardInputs } from '../models/filter-board-inputs.model';

export function mapFilterBoardData(data: Record<string, unknown>): FilterBoardInputs {
  return { config: JSON.stringify(data) };
}
