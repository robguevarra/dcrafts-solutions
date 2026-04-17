/**
 * Shopee paste ingestion parser.
 *
 * Shopee Seller Center allows copying order rows from the browser table.
 * The pasted content is typically tab-separated with these columns (order may vary):
 *   Order ID | Buyer Username | Recipient | Phone | Tracking Number | Status | Items | Total
 *
 * This parser is deliberately lenient — it tries multiple heuristics before failing.
 * Rules: never throw, always return a result (with errors) so the UI can preview issues.
 */

export interface ParsedShopeeOrder {
  /** Raw Shopee order ID extracted from the paste */
  platform_order_id: string;
  buyer_name: string | null;
  buyer_phone: string | null;
  /** Free-text items description as pasted */
  items_raw: string | null;
  /** Any warnings encountered during parse for this row */
  warnings: string[];
}

export interface ShopeeParseResult {
  orders: ParsedShopeeOrder[];
  /** Rows that could not be parsed at all */
  skipped: number;
  /** Total raw lines processed */
  totalLines: number;
}

// Shopee order IDs are typically 12–20 digit numeric strings
const SHOPEE_ORDER_ID_RE = /\b\d{12,20}\b/;
// Philippine phone normalizer: strip non-digits, accept 09xx or +639xx
const PH_PHONE_RE = /(?:\+?63|0)(9\d{9})/;

/**
 * Normalize a Philippine phone number to 09xxxxxxxxx format.
 * Returns null if no valid PH number found.
 */
function normalizePHPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  const match = cleaned.match(PH_PHONE_RE);
  if (!match) return null;
  return "0" + match[1];
}

/**
 * Parse pasted Shopee order data into structured records.
 *
 * Accepts both tab-separated (direct copy from Shopee Seller Center)
 * and comma-separated formats.
 */
export function parseShopeeOrders(raw: string): ShopeeParseResult {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const orders: ParsedShopeeOrder[] = [];
  let skipped = 0;

  for (const line of lines) {
    // Skip lines that look like headers
    if (
      /order\s*id|order\s*no|buyer\s*name|recipient|tracking/i.test(line) &&
      !SHOPEE_ORDER_ID_RE.test(line)
    ) {
      continue;
    }

    const parsed = parseLine(line);
    if (!parsed) {
      skipped++;
      continue;
    }
    orders.push(parsed);
  }

  // Deduplicate by order ID (keep last occurrence)
  const dedupMap = new Map<string, ParsedShopeeOrder>();
  for (const o of orders) {
    dedupMap.set(o.platform_order_id, o);
  }

  return {
    orders: Array.from(dedupMap.values()),
    skipped,
    totalLines: lines.length,
  };
}

function parseLine(line: string): ParsedShopeeOrder | null {
  // Detect delimiter: prefer tab, fall back to comma
  const delimiter = line.includes("\t") ? "\t" : ",";
  const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));

  const warnings: string[] = [];

  // Step 1: Find the order ID in any column
  let orderId: string | null = null;
  for (const col of cols) {
    const match = col.match(SHOPEE_ORDER_ID_RE);
    if (match) {
      orderId = match[0];
      break;
    }
  }

  if (!orderId) return null; // Can't proceed without an order ID

  // Step 2: Find phone number
  let phone: string | null = null;
  for (const col of cols) {
    const norm = normalizePHPhone(col);
    if (norm) {
      phone = norm;
      break;
    }
  }
  if (!phone) warnings.push("No valid PH phone number found");

  // Step 3: Buyer name — heuristic: non-numeric col of reasonable length
  // that's not the phone and not the order ID
  let buyerName: string | null = null;
  for (const col of cols) {
    if (
      col.length >= 2 &&
      col.length <= 60 &&
      !/^\d+$/.test(col) &&
      col !== orderId &&
      !normalizePHPhone(col) &&
      !/^(cancelled|completed|shipped|unpaid|processing)/i.test(col)
    ) {
      buyerName = col;
      break;
    }
  }

  // Step 4: Items — column with product-like text (contains letters and numbers)
  let itemsRaw: string | null = null;
  for (const col of cols) {
    if (col.length > 10 && /[a-zA-Z]/.test(col) && /\d/.test(col) && col !== buyerName) {
      itemsRaw = col.substring(0, 200);
      break;
    }
  }

  return {
    platform_order_id: orderId,
    buyer_name: buyerName,
    buyer_phone: phone,
    items_raw: itemsRaw,
    warnings,
  };
}
