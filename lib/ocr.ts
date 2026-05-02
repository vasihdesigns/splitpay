/**
 * lib/ocr.ts
 * Bill / receipt scanning using Google Cloud Vision API.
 *
 * Setup:
 *   1. Go to https://console.cloud.google.com
 *   2. Enable "Cloud Vision API"
 *   3. Create an API key (restrict it to Vision API for safety)
 *   4. Paste it below — it is free for the first 1 000 requests/month
 */

export const GOOGLE_VISION_API_KEY = 'AIzaSyByvB8LKLLHxMnKDgorIyNwrkeJeeJw7NU';

// ─── Call Google Cloud Vision API ────────────────────────────────────────────

export async function extractTextFromImage(base64Image: string): Promise<string> {
  if (!GOOGLE_VISION_API_KEY) {
    throw new Error('NO_API_KEY');
  }

  const body = {
    requests: [
      {
        image:    { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
      },
    ],
  };

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  const fullText: string =
    json?.responses?.[0]?.fullTextAnnotation?.text ?? '';
  return fullText;
}

// ─── Parse receipt text → { description, amount, items } ─────────────────────

export interface ParsedReceipt {
  description: string;
  amount:      number;
  items:       { name: string; price: number }[];
  rawText:     string;
}

/** Extract the best total amount from receipt text */
function findTotal(lines: string[]): number {
  // Priority patterns: "TOTAL" lines should come before "SUBTOTAL"
  const totalPatterns = [
    // Grand total / total due patterns  (highest priority)
    /(?:grand\s+total|total\s+due|amount\s+due|balance\s+due)\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})/i,
    // Plain "total" — but not "subtotal"
    /(?<!\w)total(?!\s*tax|\s*discount|\s*saving)\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})/i,
    // Charge / net / to pay
    /(?:net\s+total|total\s+charge|to\s+pay|amount\s+paid)\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})/i,
    // Subtotal as fallback
    /sub\s*total\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})/i,
  ];

  for (const pattern of totalPatterns) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (v > 0) return v;
      }
    }
  }

  // Fallback: find the largest dollar amount on any line
  const amounts: number[] = [];
  for (const line of lines) {
    const matches = [...line.matchAll(/\$?\s*([0-9,]+\.\d{2})\b/g)];
    for (const m of matches) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (v > 0) amounts.push(v);
    }
  }
  if (amounts.length) return Math.max(...amounts);

  return 0;
}

/** Extract merchant / expense description from receipt */
function findDescription(lines: string[]): string {
  // Skip boilerplate lines
  const skipPatterns = [
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/, // dates
    /^\d{2}:\d{2}/,                          // times
    /^(www\.|https?:)/i,                     // URLs
    /receipt|invoice|tax\s*id|vat\s*no|reg\s*no|tel:|phone:/i,
    /^(subtotal|total|tax|tip|change|cash|card|visa|master)/i,
    /^\d+$/,                                 // plain numbers
    /^[*\-=_#]{2,}/,                         // decorative lines
    /thank\s*you|come\s*again|customer\s*copy/i,
  ];

  for (const line of lines.slice(0, 8)) {
    const trimmed = line.trim();
    if (trimmed.length < 2) continue;
    if (skipPatterns.some(p => p.test(trimmed))) continue;
    // Must have at least one letter
    if (!/[a-zA-Z]/.test(trimmed)) continue;
    return trimmed;
  }

  return '';
}

/** Extract individual line items from receipt */
function findLineItems(lines: string[]): { name: string; price: number }[] {
  const items: { name: string; price: number }[] = [];
  // Pattern: "<description>  <price>"  e.g. "Chicken Burger    12.50"
  const itemPattern = /^(.+?)\s{2,}\$?\s*([0-9,]+\.\d{2})\s*$/;
  const skipWords = /total|tax|tip|change|discount|subtotal|balance|paid|change|service/i;

  for (const line of lines) {
    const m = line.trim().match(itemPattern);
    if (!m) continue;
    const name  = m[1].trim();
    const price = parseFloat(m[2].replace(/,/g, ''));
    if (skipWords.test(name)) continue;
    if (price <= 0 || price > 10000) continue;
    if (name.length < 2) continue;
    items.push({ name, price });
  }

  return items.slice(0, 20); // cap at 20 items
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const amount      = findTotal(lines);
  const description = findDescription(lines);
  const items       = findLineItems(lines);

  return { description, amount, items, rawText };
}
