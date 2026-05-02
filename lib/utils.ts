/**
 * Returns the appropriate Ionicons icon name, color, and background
 * based on the expense description text.
 */
export function getExpenseIcon(description: string): { name: string; color: string; bg: string } {
  const d = description.toLowerCase();
  if (/food|eat|dinner|lunch|breakfast|meal|restaurant|burger|pizza|sushi|cafe|coffee|tea|snack|bakery|shawarma|biryani|fast.?food/.test(d))
    return { name: 'restaurant-outline', color: '#f97316', bg: '#fff7ed' };
  if (/taxi|uber|careem|lyft|cab|car|drive|petrol|fuel|parking|toll|bus|metro|train|transport|ride/.test(d))
    return { name: 'car-outline', color: '#3b82f6', bg: '#eff6ff' };
  if (/flight|plane|airport|travel|trip|holiday|vacation|hotel|stay|airbnb/.test(d))
    return { name: 'airplane-outline', color: '#6366f1', bg: '#eef2ff' };
  if (/shop|mall|store|buy|purchase|clothes|shoes|amazon|online|shopping/.test(d))
    return { name: 'bag-handle-outline', color: '#ec4899', bg: '#fdf4ff' };
  if (/movie|cinema|film|show|concert|event|ticket|entertainment|netflix/.test(d))
    return { name: 'film-outline', color: '#8b5cf6', bg: '#f5f3ff' };
  if (/gym|sport|fitness|workout|yoga|swim|tennis|football|cricket/.test(d))
    return { name: 'barbell-outline', color: '#10b981', bg: '#ecfdf5' };
  if (/doctor|medical|pharmacy|hospital|medicine|clinic|health/.test(d))
    return { name: 'medkit-outline', color: '#ef4444', bg: '#fef2f2' };
  if (/electric|utility|wifi|internet|phone|mobile/.test(d))
    return { name: 'flash-outline', color: '#f59e0b', bg: '#fffbeb' };
  if (/rent|home|house|apartment|flat/.test(d))
    return { name: 'home-outline', color: '#92400e', bg: '#fef3c7' };
  if (/bill|water|gas|subscription/.test(d))
    return { name: 'receipt-outline', color: '#4f46e5', bg: '#eef2ff' };
  if (/grocery|supermarket|market|vegetables|fruit|milk/.test(d))
    return { name: 'cart-outline', color: '#22c55e', bg: '#f0fdf4' };
  if (/drink|beer|bar|party|club|alcohol|wine/.test(d))
    return { name: 'wine-outline', color: '#a855f7', bg: '#faf5ff' };
  if (/gift|birthday|present|celebration/.test(d))
    return { name: 'gift-outline', color: '#f43f5e', bg: '#fff1f2' };
  if (/book|course|class|school|education|learn/.test(d))
    return { name: 'book-outline', color: '#0ea5e9', bg: '#f0f9ff' };
  return { name: 'receipt-outline', color: '#4f46e5', bg: '#eef2ff' };
}

/**
 * Currency symbol map — Hermes/React Native has limited Intl support
 * so we use explicit symbols instead of relying on Intl.NumberFormat.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',   EUR: '€',   GBP: '£',   AED: 'AED ',
  SAR: 'SAR ',INR: '₹',   PKR: '₨',   EGP: 'E£',
  CAD: 'CA$', AUD: 'A$',  JPY: '¥',   CNY: '¥',
  CHF: 'Fr ', SGD: 'S$',  MYR: 'RM ', TRY: '₺',
};

/**
 * Format a number as currency
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
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

/**
 * Formats a date as Splitwise-style relative time:
 * "Just now", "5 minutes ago", "3 hours ago",
 * "Yesterday at 9:52 PM", "Friday at 9:52 PM", "Apr 26 at 9:52 PM"
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = diffMs / 60000;
  const diffHours = diffMs / 3600000;
  const diffDays = diffMs / 86400000;

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (diffMins < 1)  return 'Just now';
  if (diffMins < 60) return `${Math.floor(diffMins)} minute${Math.floor(diffMins) === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${Math.floor(diffHours)} hour${Math.floor(diffHours) === 1 ? '' : 's'} ago`;

  // Check if yesterday
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${timeStr}`;

  if (diffDays < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName} at ${timeStr}`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
}
