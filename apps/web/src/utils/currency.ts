/**
 * Utility functions for Indian Rupee currency formatting and safe integer paise conversion.
 * Avoids IEEE-754 floating point inaccuracies.
 */

/**
 * Formats integer paise into a standard INR string (e.g. 150050 -> "₹1,500.50")
 */
export function formatPaise(paise: number | bigint): string {
  const numPaise = Number(paise);
  const isNegative = numPaise < 0;
  const absPaise = Math.abs(numPaise);

  const rupees = Math.floor(absPaise / 100);
  const remainder = absPaise % 100;
  const paiseStr = remainder.toString().padStart(2, '0');

  // Indian number formatting for rupees
  const formattedRupees = new Intl.NumberFormat('en-IN').format(rupees);
  const formatted = `₹${formattedRupees}.${paiseStr}`;

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Safely parses user-entered decimal rupee string into integer paise without floating point issues.
 * Examples:
 * "1500" -> 150000
 * "1500.5" -> 150050
 * "1500.50" -> 150050
 * "0.99" -> 99
 */
export function parseRupeesToPaise(input: string): number {
  const sanitized = input.trim().replace(/[^\d.]/g, '');
  if (!sanitized) return 0;

  const parts = sanitized.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  const fraction = (parts[1] || '').slice(0, 2).padEnd(2, '0');
  const fractionNum = parseInt(fraction, 10);

  if (isNaN(whole) || isNaN(fractionNum)) return 0;
  return whole * 100 + fractionNum;
}

/**
 * Converts integer paise back to an editable decimal rupee string for forms (e.g. 150050 -> "1500.50")
 */
export function paiseToRupeeInput(paise: number): string {
  if (!paise || paise <= 0) return '';
  const rupees = Math.floor(paise / 100);
  const rem = paise % 100;
  return rem === 0 ? rupees.toString() : `${rupees}.${rem.toString().padStart(2, '0')}`;
}
