const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'backend/Code.gs'), 'utf8');

// Stateful REST fake: exercise setup and the existing business logic together.
// It deliberately has no SpreadsheetApp, DriveApp, or active spreadsheet.
function backend() {
  const props = new Map();
  const files = new Map();
  const tabs = new Map();
  const requests = [];
  let seq = 0;
  let locked = false;
  const response = (data, code = 200) => ({
    getResponseCode: () => code, getContentText: () => JSON.stringify(data)
  });
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props.get(k) || null,
      setProperty: (k, v) => props.set(k, v)
    }) },
    ScriptApp: { getOAuthToken: () => 'server-only-token' },
    LockService: { getScriptLock: () => ({
      waitLock: () => { assert.equal(locked, false); locked = true; },
      releaseLock: () => { locked = false; }
    }) },
    Logger: { log() {} },
    Utilities: {
      getUuid: () => String(++seq).padStart(12, '0') + '-uuid',
      base64Decode: s => [...Buffer.from(s, 'base64')],
      base64Encode: bytes => Buffer.from(bytes).toString('base64')
    },
    UrlFetchApp: { fetch: (rawUrl, options) => {
      const url = new URL(rawUrl);
      requests.push({ url, options });
      assert.equal(options.headers.Authorization, 'Bearer server-only-token');
      const body = options.contentType === 'application/json' ? JSON.parse(options.payload) : null;
      if (url.pathname === '/drive/v3/files' && options.method === 'post') {
        const file = { ...body, id: 'file-' + ++seq };
        files.set(file.id, file);
        return response(file);
      }
      if (url.pathname === '/upload/drive/v3/files') {
        const metadata = JSON.parse(options.payload.split('\r\n\r\n')[1].split('\r\n--')[0]);
        const file = { ...metadata, id: 'upload-' + ++seq, size: '1024' };
        files.set(file.id, file);
        return response(file);
      }
      if (url.pathname.startsWith('/drive/v3/files/')) {
        const id = url.pathname.split('/')[4];
        if (!files.has(id)) return response({ error: 'Not authorized' }, 404);
        return response(url.pathname.endsWith('/permissions') ? {} : files.get(id));
      }
      if (url.pathname === '/drive/v3/files') {
        assert.match(url.searchParams.get('q'), /in parents and trashed = false/);
        if (!url.searchParams.has('pageToken')) return response({ files: [], nextPageToken: 'second' });
        return response({ files: [...files.values()].filter(f => f.mimeType === 'application/pdf') });
      }
      if (url.hostname === 'sheets.googleapis.com') {
        const suffix = url.pathname.split('/v4/spreadsheets/' + props.get('SPREADSHEET_ID'))[1];
        assert.notEqual(suffix, undefined);
        if (!suffix) return response({ sheets: [...tabs.values()].map(t => ({ properties: t.properties })) });
        if (suffix === ':batchUpdate') {
          for (const r of body.requests) {
            if (r.addSheet) {
              const p = r.addSheet.properties;
              assert(!tabs.has(p.title));
              tabs.set(p.title, { properties: p, rows: [] });
            }
            if (r.repeatCell) {
              const p = [...tabs.values()].find(t => t.properties.sheetId === r.repeatCell.range.sheetId).properties;
              assert(p.gridProperties.columnCount >= r.repeatCell.range.endColumnIndex);
            }
            if (r.deleteDimension) {
              const range = r.deleteDimension.range;
              [...tabs.values()].find(t => t.properties.sheetId === range.sheetId).rows.splice(range.startIndex, 1);
            }
          }
          return response({});
        }
        const range = decodeURIComponent(suffix.slice('/values/'.length));
        const name = range.match(/^'([^']+)'/)[1];
        const tab = tabs.get(name);
        if (options.method === 'get') return response({ values: tab.rows });
        assert.equal(url.searchParams.get('valueInputOption'), 'RAW');
        if (range.endsWith(':append')) tab.rows.push(...body.values);
        else {
          const start = Number(range.match(/!A(\d+)/)[1]) - 1;
          body.values.forEach((row, i) => { tab.rows[start + i] = row; });
        }
        return response({});
      }
      throw new Error('Unexpected request: ' + rawUrl);
    } }
  });
  vm.runInContext(source, context);
  return { context, props, files, tabs, requests, run: code => vm.runInContext(code, context) };
}

test('manifest limits authorization to per-file access and external requests', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
  assert.deepEqual(manifest.oauthScopes, [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/script.external_request'
  ]);
  assert.deepEqual(manifest.dependencies.enabledAdvancedServices, [
    { userSymbol: 'Drive', version: 'v3', serviceId: 'drive' },
    { userSymbol: 'Sheets', version: 'v4', serviceId: 'sheets' }
  ]);
  assert.doesNotMatch(source, /\b(?:SpreadsheetApp|DriveApp|Session)\s*\./);
});

test('setup creates dedicated resources, supports 27-column catalog, and is idempotent', () => {
  const b = backend();
  b.run('setupRevampedLMS()');
  assert.equal(b.files.size, 4);
  assert.equal(b.tabs.size, 7);
  assert.equal(b.tabs.get('1_Catalog').rows[0].length, 27);
  const resources = JSON.stringify([...b.props]);
  const defaults = JSON.stringify([...b.tabs]);
  b.run('setupRevampedLMS()');
  assert.equal(JSON.stringify([...b.props]), resources);
  assert.equal(JSON.stringify([...b.tabs]), defaults);
  assert.equal(b.files.size, 4);
  assert(!b.requests.some(r => r.url.pathname === '/drive/v3/files' && r.options.method === 'get'));
});

test('catalog creation, updates, lending, returns, and deletion use the saved spreadsheet', () => {
  const b = backend();
  b.run('setupRevampedLMS()');
  b.run("saveBookAndCopy_({ Book_ID: 'BK-1', Title_English: '=literal title', Authors: 'Author' })");
  assert.equal(b.run("getTableData_('1_Catalog')[0].Title_English"), '=literal title');
  assert.equal(b.run("getTableData_('2_Copies')[0].Accession_Number"), 'LIB-01001');
  b.run("saveBookAndCopy_({ Book_ID: 'BK-1', isEditMode: true, Title_English: 'Updated' })");
  assert.equal(b.run("getTableData_('1_Catalog').length"), 1);
  b.run("checkoutBook_({ Accession_Number: 'LIB-01001', Member_ID: 'MEM-01' })");
  assert.equal(b.run("getTableData_('2_Copies')[0].Status"), 'Lent');
  b.run("returnBook_({ Accession_Number: 'LIB-01001' })");
  assert.equal(b.run("getTableData_('2_Copies')[0].Status"), 'Available');
  b.run("deleteRecord_({ table: '1_Catalog', pkColumn: 'Book_ID', id: 'BK-1' })");
  assert.equal(b.run("getTableData_('1_Catalog').length"), 0);
  assert.throws(() => b.run("getTableData_('unrelated spreadsheet')"), /Unknown library table/);
});

test('cover and PDF uploads retain public viewer links; archive listing handles pagination', () => {
  const b = backend();
  b.run('setupRevampedLMS()');
  const cover = b.run("saveImageToDrive_('data:image/jpeg;base64,aGVsbG8=', 'cover.jpg')");
  assert.match(cover, /^https:\/\/drive.google.com\/thumbnail\?id=upload-/);
  b.run("uploadArchivePdf_({ base64Data: 'data:application/pdf;base64,aGVsbG8=', fileName: 'Book.pdf' })");
  assert.equal(b.run("getTableData_('6_Digital_Archive')[0].File_Size_MB"), '0.00');
  // Simulate a prior interrupted sync by removing the metadata, leaving the uploaded file.
  b.tabs.get('6_Digital_Archive').rows.splice(1);
  assert.equal(b.run('syncDriveArchive_().newlyLinkedCount'), 1);
  assert.equal(b.run('syncDriveArchive_().newlyLinkedCount'), 0);
  assert.equal(b.requests.filter(r => r.url.pathname.endsWith('/permissions')).length, 2);
  const upload = b.requests.find(r => r.url.pathname === '/upload/drive/v3/files');
  assert.match(upload.options.payload, /Content-Transfer-Encoding: base64\r\n\r\naGVsbG8=/);
});

test('inaccessible existing IDs fail rather than silently creating replacement storage', () => {
  const b = backend();
  b.props.set('ROOT_FOLDER_ID', 'unrelated-folder');
  assert.throws(() => b.run('setupRevampedLMS()'), /404/);
  assert.equal(b.files.size, 0);
});
