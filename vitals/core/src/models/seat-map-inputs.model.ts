export interface SeatMapInputs {
  config?: string;
  seatmap: string;
  currency: string;
  maxSelectable: string;
  /** `comfortable` | `compact`. Cuánto espacio ocupa el mapa. */
  density: string;
  /** Si se rotula el recargo bajo cada butaca. */
  showPrices: string;
  /** Si se dibuja la leyenda. */
  showLegend: string;
}
