// Import the Date / Amount / Description layout shown in the vendor ledger.
function isRed(color) {
  if (typeof color?.argb !== 'string' || !/^(?:[\da-f]{2})?[\da-f]{6}$/i.test(color.argb)) {
    return false;
  }
  const rgb = color.argb.slice(-6);
  const [r, g, b] = [0, 2, 4].map(offset => parseInt(rgb.slice(offset, offset + 2), 16));
  return r >= 96 && r - Math.max(g, b) >= 64 && Math.abs(g - b) <= 48;
}

function hasRedText(cell) {
  const runs = cell.value?.richText;
  if (Array.isArray(runs)) {
    return runs.some(run => run.text?.trim() && isRed(run.font?.color ?? cell.font?.color));
  }
  return cell.text.trim() !== '' && isRed(cell.font?.color);
}

function amountCents(cell) {
  const value = cell.value;
  const amount = value && typeof value === 'object' && 'result' in value ? value.result : value;
  if (typeof amount === 'number') {
    const scaled = amount * 100;
    const cents = Math.round(scaled);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
    return Number.isSafeInteger(cents) && Math.abs(scaled - cents) <= tolerance ? cents : null;
  }
  if (typeof amount !== 'string') return null;
  const text = amount.trim().replace(/−/g, '-').replace(/^(?:¥|￥)\s*/, '');
  const signed = text.startsWith('(') && text.endsWith(')') ? '-' + text.slice(1, -1) : text;
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(signed)) return null;
  const [whole, fraction = ''] = signed.replace(/^[+-]/, '').replace(/,/g, '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? (signed.startsWith('-') ? -cents : cents) : null;
}

const summaryLabel = /^(?:opening\s+balance|closing\s+balance|balance|grand\s+total|sub\s*total|total|合计|小计|余额)(?:[\s:：-]|$)/i;

export function redPaymentRows(sheet) {
  const rows = [];
  const skipped = [];
  let netCents = 0;
  sheet.eachRow((row, number) => {
    const [date, amount, description] = [1, 2, 3].map(column => row.getCell(column));
    if (!row.hasValues || summaryLabel.test(date.text.trim()) || summaryLabel.test(description.text.trim())) {
      return;
    }
    if (![date, amount, description].some(hasRedText)) return;
    const cents = amountCents(amount);
    if (cents === null) {
      skipped.push(number);
      return;
    }
    netCents += cents;
    if (!Number.isSafeInteger(netCents)) throw new Error('The red-row total exceeds the supported range.');
    rows.push({number, date: date.text, description: description.text, cents});
  });
  return {rows, skipped, netCents};
}
