import { parseCsv } from './crmImport.js';

const EXCEL_EXTENSIONS = /\.(xlsx|xlsm|xls|ods|numbers)$/i;

export const isExcelFile = (file) => {
  if (!file) return false;
  if (EXCEL_EXTENSIONS.test(file.name || '')) return true;
  return /spreadsheetml|ms-excel|opendocument\.spreadsheet/i.test(file.type || '');
};

const loadXlsx = () => import('xlsx');

/**
 * Reads every sheet of an Excel/CSV file into `{ name, rows }` entries where `rows` is a 2D array
 * of cell values. Dates come back as JS Date objects (Excel) or strings (CSV); blank cells and
 * blank rows are kept (as '' / []) so row indexes line up with the spreadsheet's row numbers.
 * Empty sheets are dropped. A CSV yields a single sheet.
 */
export const readWorkbookSheets = async (file) => {
  if (!file) return [];
  if (!isExcelFile(file)) {
    const text = await file.text();
    return [{ name: file.name || 'CSV', rows: parseCsv(text) }];
  }

  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', blankrows: true, raw: true }),
  })).filter((sheet) => sheet.rows.some((cells) => cells.some((c) => c !== '' && c != null)));
};

/** Reads the first non-empty sheet of an Excel/CSV file into a 2D array of cell values. */
export const readSpreadsheetFile = async (file) => {
  const sheets = await readWorkbookSheets(file);
  return sheets[0]?.rows || [];
};

export const downloadXlsx = async (rows2d, filename, sheetName = 'Sheet1') => {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows2d);
  const widths = (rows2d[0] || []).map((_, colIdx) => ({
    wch: Math.min(60, Math.max(12, ...rows2d.map((row) => String(row[colIdx] ?? '').length + 2))),
  }));
  sheet['!cols'] = widths;
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, filename);
};
