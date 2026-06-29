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
  const annualRate = clampNonNegative(request.annualRate);
  const monthlyRate = annualRate / 12 / 100;

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
