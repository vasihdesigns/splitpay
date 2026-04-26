/**
 * Format a number as currency
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
}

/**
 * Returns initials from a full name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Format a date string to a readable format
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Simplified debt algorithm — reduces number of transactions needed
 * Given a map of userId → net balance, returns a minimal list of payments
 */
export function simplifyDebts(
  balances: Record<string, number>
): Array<{ from: string; to: string; amount: number }> {
  const creditors: Array<[string, number]> = [];
  const debtors: Array<[string, number]> = [];

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance > 0.01) creditors.push([userId, balance]);
    else if (balance < -0.01) debtors.push([userId, -balance]);
  }

  const transactions: Array<{ from: string; to: string; amount: number }> = [];

  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const [creditorId, credit] = creditors[i];
    const [debtorId, debt]     = debtors[j];
    const amount = Math.min(credit, debt);

    transactions.push({ from: debtorId, to: creditorId, amount: +amount.toFixed(2) });

    creditors[i][1] -= amount;
    debtors[j][1]   -= amount;

    if (creditors[i][1] < 0.01) i++;
    if (debtors[j][1]   < 0.01) j++;
  }

  return transactions;
}
