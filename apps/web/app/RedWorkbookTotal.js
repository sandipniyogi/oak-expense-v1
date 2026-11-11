'use client';
import {useState} from 'react';
import {redPaymentRows} from './redPaymentRows.mjs';

const money = cents => new Intl.NumberFormat('en-CN', {style:'currency', currency:'CNY'}).format(cents / 100);

export default function RedWorkbookTotal({disabled, onUse}) {
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(file) {
    if (!file) return;
    setSheets([]);
    setSheetIndex(0);
    setFilename('');
    setError('');
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError('Choose an .xlsx workbook up to 5 MB.');
      return;
    }
    setBusy(true);
    try {
      const {default: ExcelJS} = await import('exceljs/dist/exceljs.min.js');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const previews = workbook.worksheets.filter(sheet => sheet.state === 'visible')
        .map(sheet => ({name: sheet.name, ...redPaymentRows(sheet)}));
      if (!previews.length) throw new Error('The workbook has no visible worksheets.');
      setSheets(previews);
      setSheetIndex(Math.max(0, previews.findIndex(sheet => sheet.rows.length > 0)));
      setFilename(file.name);
    } catch (cause) {
      setError(cause?.message === 'The workbook has no visible worksheets.'
        ? cause.message : 'Could not read this workbook. Check that it opens in Excel and is saved as .xlsx.');
    } finally {
      setBusy(false);
    }
  }

  const preview = sheets[sheetIndex];
  const payments = preview?.rows.filter(row => row.cents < 0) ?? [];
  return <div className="combined-item" style={{padding:16,margin:'14px 0',border:'1px solid #dce5dc',borderRadius:12}}>
    <h3>Total red payments from Excel</h3>
    <p>Use columns A–C for date, signed amount (CNY), and description. Apply red font directly to at least one of those cells in each payment row.</p>
    <label className="batch-picker">Choose Excel workbook
      <input type="file" accept=".xlsx" disabled={busy || disabled} onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        void load(file);
      }}/>
    </label>
    {busy && <p role="status">Reading workbook…</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <>
      <label>Worksheet <select value={sheetIndex} onChange={event => setSheetIndex(Number(event.target.value))}>
        {sheets.map((sheet, index) => <option key={sheet.name} value={index}>{sheet.name}</option>)}
      </select></label>
      <p className="message">{filename} · {preview.rows.length} red payment rows</p>
      {preview.skipped.length > 0 && <p role="alert">Could not read the amount in red rows {preview.skipped.join(', ')}. Fix those amounts in Excel and select the file again.</p>}
      {preview.rows.length ? <>
        <p role="status"><strong>{preview.skipped.length ? 'Partial total' : 'Net total'}: {money(preview.netCents)}</strong>{preview.netCents < 0 && ` · Net outflow: ${money(-preview.netCents)}`}</p>
        <button type="button" disabled={disabled || payments.length === 0 || payments.length > 50}
          onClick={() => onUse({filename, sheet: preview.name, rows: payments})}>
          Add {payments.length} red outflows to payment amounts
        </button>
        <p className="message">Review the vendor, payer and payment method before saving. Red credits and zero amounts stay in the preview. Up to 50 outflows can be added at once.</p>
        <div style={{maxHeight:320,overflow:'auto'}}>
          <table><thead><tr><th>Row</th><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
            <tbody>{preview.rows.map(row => <tr key={row.number}>
              <td>{row.number}</td><td>{row.date}</td><td>{row.description}</td><td>{money(row.cents)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : <p>No payment rows with readable amounts and directly applied red font were found on this worksheet.</p>}
    </>}
  </div>;
}
