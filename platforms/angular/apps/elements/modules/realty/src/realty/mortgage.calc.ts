import type { AmortizationRow, MortgageRequest, MortgageResult } from './realty.model';

/**
 * Pure, deterministic mortgage math (propiedades-app-spec §4: el cálculo base es
 * cliente, sin estado ni seam C#). Standard fixed-rate amortization (sistema
 * francés / cuota fija):
 *
 *   M = P · r / (1 − (1 + r)^−n)
 *
 * where P = principal financed, r = monthly rate (annual% / 12 / 100), n = term in
 * months. A 0% rate degrades to straight-line P / n. Inputs are clamped so the UI
 * never produces NaN/Infinity while the user is still typing.
 *
 * No Angular, no I/O — trivially unit-tested and reusable.
 *
 * **Y desde el defecto #76 no está sola: la misma cuenta existe en C#** detrás de
 * `POST /api/realty/mortgage`, y durante toda la vida de ese endpoint las dos
 * discreparon 100× en la tasa sin que nada las cruzara — acá porcentaje, allá
 * fracción. Hoy lo vigilan los vectores de oro compartidos
 * (`docs/contracts/mortgage-vectors.json` del CMS), que las dos EJECUTAN: ver
 * `mortgage-vectores.spec.ts`. Las expectativas de ese fichero no salen de ninguna de
 * las dos implementaciones —se derivaron de la fórmula cerrada con aritmética decimal
 * de 50 dígitos— porque un fixture sacado de una implementación es una foto: detecta
 * que se separan, no que las dos están mal a la vez.
 *
 * **Lo que ese cruce NO compara, y es deliberado:** `totalInterest` / `totalPaid`. Las
 * dos totalizan con métodos distintos y los dos son correctos — el C# suma el cuadro
 * completo redondeado a centavos con la última cuota absorbiendo el redondeo, y esta
 * multiplica la cuota SIN redondear por el plazo, porque construye sólo las primeras
 * filas y no tiene qué sumar. Medido: cinco centavos sobre 634 millones. Está escrito
 * para que nadie lo lea como deriva.
 */
export function calculateMortgage(
  request: MortgageRequest,
  scheduleRows = 12,
): MortgageResult {
  const price = clampNonNegative(request.price);
  const rawDown = clampNonNegative(request.downPayment);
  // Down payment can never exceed the price.
  const downPayment = Math.min(rawDown, price);
  const principal = Math.max(0, price - downPayment);
  const termMonths = Math.max(1, Math.trunc(clampNonNegative(request.termMonths)));
  const annualRatePercent = clampNonNegative(request.annualRatePercent);
  const monthlyRate = annualRatePercent / 12 / 100;

  if (principal === 0) {
    return { monthly: 0, totalInterest: 0, principal: 0, totalPaid: 0, schedule: [] };
  }

  const monthly =
    monthlyRate === 0
      ? principal / termMonths
      : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));

  const totalPaid = monthly * termMonths;
  const totalInterest = Math.max(0, totalPaid - principal);

  return {
    monthly: round2(monthly),
    totalInterest: round2(totalInterest),
    principal: round2(principal),
    totalPaid: round2(totalPaid),
    schedule: buildSchedule(principal, monthlyRate, monthly, termMonths, scheduleRows),
  };
}

/** First `rows` periods of the amortization table (or the whole loan if shorter). */
function buildSchedule(
  principal: number,
  monthlyRate: number,
  monthly: number,
  termMonths: number,
  rows: number,
): readonly AmortizationRow[] {
  const limit = Math.max(0, Math.min(rows, termMonths));
  const schedule: AmortizationRow[] = [];
  let balance = principal;
  for (let period = 1; period <= limit; period += 1) {
    const interest = balance * monthlyRate;
    const principalPaid = Math.min(monthly - interest, balance);
    balance = Math.max(0, balance - principalPaid);
    schedule.push({
      period,
      payment: round2(monthly),
      principal: round2(principalPaid),
      interest: round2(interest),
      balance: round2(balance),
    });
  }
  return schedule;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
