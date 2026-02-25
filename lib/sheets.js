/**
 * lib/sheets.js
 * Shared Google Sheets client and helper functions.
 *
 * Required env vars:
 *   GOOGLE_SPREADSHEET_ID        — the ID from the Sheet URL
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — full service account JSON as a string
 */

const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

/**
 * Build a GoogleAuth instance from the service account JSON env var.
 */
function getAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set');
  }
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Return an authenticated Sheets v4 client.
 */
async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Read all values from a named range (e.g. 'Teams!A:F').
 * Returns a 2-D array; empty cells become undefined in the row array.
 * Returns [] when the sheet has no data.
 */
async function readRange(range) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID is not set');
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return res.data.values || [];
}

/**
 * Append a single row to a sheet tab.
 * @param {string} sheetName  Tab name only (e.g. 'Teams'), no range suffix needed.
 * @param {Array}  row        Flat array of values in column order.
 */
async function appendRow(sheetName, row) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID is not set');
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

/**
 * Overwrite a range with a 2-D array of values.
 * @param {string}   range   e.g. 'Standings!A1:I20'
 * @param {Array[][]} values  2-D array (rows × columns)
 */
async function updateRange(range, values) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID is not set');
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/**
 * Clear all values in a range without removing formatting.
 * @param {string} range  e.g. 'Standings!A2:I1000'
 */
async function clearRange(range) {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID is not set');
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
}

module.exports = { readRange, appendRow, updateRange, clearRange };
