/**
 * ============================================================================
 * HOME LIBRARY & DIGITAL ARCHIVE — 24-FIELD BACKEND API (Code.gs)
 * ============================================================================
 * 1. Copy appsscript.json too; its service declarations enable APIs in the Default project.
 * 2. Run `setupRevampedLMS()` to create the app-owned database & storage folders.
 * 3. Add `ADMIN_PIN` and `GEMINI_API_KEY` in Project Settings > Script Properties.
 * 4. Deploy > New Deployment > Web App (Execute as: Me, Access: Anyone).
 * ============================================================================
 */

const SCHEMA = {
  '1_Catalog': [
    'Book_ID',              // 1. Book ID
    'Title_English',        // 2a. Book Title (English / Transliterated)
    'Title_Original',       // 2b. Original Script Title (Malayalam / Arabic / Hindi)
    'Book_Type',            // 3. Normal Book / Series / Volume
    'Series_Name',          // 4. Series Name
    'Volume_Number',        // 5. Volume Number
    'Authors',              // 6. Author(s)
    'Publisher',            // 7. Publisher
    'ISBN',                 // 8. ISBN (13 or 10)
    'Edition',              // 9. Edition
    'Language',             // 10. Language
    'Category_Genre',       // 11. Category / Genre
    'Publish_Year',         // 12. Publication Year
    'Pages',                // 13. Number of Pages
    'Book_Format',          // 14. Physical / E-book / Audiobook / PDF Scan
    'Reading_Status',       // 18. Unread / Reading / Completed
    'Rating',               // 20. Rating (1-5)
    'Notes_Remarks',        // 21. Notes / Remarks
    'Cover_Image_URL',      // 22. Front Cover Image
    'Description_Blurb',    // 23. Blurb / Description
    'Back_Image_URL',       // 24. Back Cover Image
    'Call_Number',          // Base Call Number
    'Call_Number_Mode',     // Auto / DDC / Manual
    'Has_Digital_Copy',     // Boolean
    'Digital_View_URL',     // Direct link to PDF preview
    'Created_At',
    'Updated_At'
  ],
  '2_Copies': [
    'Accession_Number',     // Unique QR / Accession ID (e.g., LIB-01001)
    'Book_ID',              // Foreign Key -> 1_Catalog
    'Book_Title_Ref',       // Denormalized Title
    'Call_Number',          // Copy Spine Call Number (e.g., 894.812 BAS c.1)
    'Shelf_Location',       // 15. Physical Location Dropdown (Room > Shelf > Row)
    'Date_Acquired',        // 16. Date Acquired
    'Purchase_Price',       // 17. Purchase Price
    'Book_Condition',       // 19. New / Good / Worn / Damaged / Fragile
    'Notes_Remarks',        // Copy-specific notes
    'Status'                // Available / Lent / Reserved / Lost
  ],
  '3_System_Configs': [
    'Config_ID',
    'Config_Type',          // Language | Category_Genre | Shelf_Location | WhatsApp_Template | Branding
    'Config_Key',
    'Config_Value'
  ],
  '4_Members': [
    'Member_ID',
    'Full_Name',
    'Relationship',         // Family / Friend / Neighbour / Owner
    'Phone_WhatsApp',       // With country code (e.g., 919876543210)
    'Email',
    'Max_Loan_Limit',
    'Active_Loans_Count',
    'Status'
  ],
  '5_Transactions': [
    'Txn_ID',
    'Accession_Number',
    'Book_ID',
    'Book_Title',
    'Call_Number',
    'Member_ID',
    'Member_Name',
    'Issue_Date',
    'Due_Date',
    'Return_Date',
    'Renewal_Count',
    'Issue_Condition',
    'Return_Condition',
    'Last_Reminded_Date',
    'Status',               // Active / Returned / Overdue
    'Notes'
  ],
  '6_Digital_Archive': [
    'Digital_ID',
    'Book_ID',
    'Book_Title',
    'Drive_File_ID',
    'Drive_View_URL',
    'Drive_Download_URL',
    'File_Name',
    'File_Size_MB',
    'Access_Level',
    'Uploaded_Date'
  ],
  '7_Audit_Log': [
    'Log_ID',
    'Timestamp',
    'Action_Type',
    'Target_Table',
    'Target_ID',
    'Details_JSON'
  ]
};

/**
 * 1. ONE-CLICK INSTALLER: RUN THIS ONCE FROM THE APPS SCRIPT EDITOR
 */
function setupRevampedLMS() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Reuse only IDs saved by this installation. Never search the user's Drive.
    const rootId = ensureLibraryFolder_('ROOT_FOLDER_ID', 'Home_Library_LMS_Storage');
    ensureLibraryFolder_('COVERS_FOLDER_ID', 'LMS_Covers', rootId);
    ensureLibraryFolder_('ARCHIVE_FOLDER_ID', 'LMS_Digital_Archive', rootId);
    if (!props.getProperty('SPREADSHEET_ID')) {
      const file = googleApi_('https://www.googleapis.com/drive/v3/files?fields=id', 'post', {
        name: 'Home_Library_Database',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [rootId]
      });
      props.setProperty('SPREADSHEET_ID', file.id);
    }
    const metadata = sheetsApi_('?fields=sheets.properties');
    const sheets = metadata.sheets || [];
    const requests = [];
    Object.keys(SCHEMA).forEach((name, index) => {
      let sheet = sheets.find(s => s.properties.title === name);
      if (!sheet) {
        // Avoid collisions with the initial blank sheet and with existing tabs.
        const id = Math.max(0, ...sheets.map(s => s.properties.sheetId)) + index + 1;
        sheet = { properties: { sheetId: id, title: name,
          gridProperties: { columnCount: Math.max(26, SCHEMA[name].length) } } };
        requests.push({ addSheet: { properties: sheet.properties } });
      }
      const sheetId = sheet.properties.sheetId;
      requests.push({ updateSheetProperties: {
        properties: { sheetId: sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount'
      } });
      requests.push({ repeatCell: {
        range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1,
          startColumnIndex: 0, endColumnIndex: SCHEMA[name].length },
        cell: { userEnteredFormat: {
          backgroundColor: { red: 30 / 255, green: 41 / 255, blue: 59 / 255 },
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          horizontalAlignment: 'CENTER'
        } },
        fields: 'userEnteredFormat'
      } });
    });
    sheetsApi_(':batchUpdate', 'post', { requests: requests });
    Object.keys(SCHEMA).forEach(name => writeRows_(name, 1, [SCHEMA[name]]));
    props.setProperty('NEXT_ACCESSION_SEQ', props.getProperty('NEXT_ACCESSION_SEQ') || '1001');

    if (readRows_('3_System_Configs').length <= 1) {
      const defaultConfigs = [
        ['CFG-L1', 'Language', 'English', 'English'],
        ['CFG-L2', 'Language', 'Malayalam', 'Malayalam (മലയാളം)'],
        ['CFG-L3', 'Language', 'Arabic', 'Arabic (العربية)'],
        ['CFG-L4', 'Language', 'Hindi', 'Hindi (हिन्दी)'],
        ['CFG-L5', 'Language', 'Sanskrit', 'Sanskrit'],
        ['CFG-L6', 'Language', 'Tamil', 'Tamil'],
        ['CFG-G1', 'Category_Genre', 'Fiction & Literature', 'Fiction & Literature'],
        ['CFG-G2', 'Category_Genre', 'History & Sociology', 'History & Sociology'],
        ['CFG-G3', 'Category_Genre', 'Religion & Philosophy', 'Religion & Philosophy'],
        ['CFG-G4', 'Category_Genre', 'Biography & Memoir', 'Biography & Memoir'],
        ['CFG-G5', 'Category_Genre', 'Science & Technology', 'Science & Technology'],
        ['CFG-G6', 'Category_Genre', 'Reference & Rare Archive', 'Reference & Rare Archive'],
        ['CFG-G7', 'Category_Genre', 'Poetry & Drama', 'Poetry & Drama'],
        ['CFG-G8', 'Category_Genre', 'Children & Youth', 'Children & Youth'],
        ['CFG-S1', 'Shelf_Location', 'Main Room - Shelf A - Row 1', 'Main Room - Shelf A - Row 1'],
        ['CFG-S2', 'Shelf_Location', 'Main Room - Shelf A - Row 2', 'Main Room - Shelf A - Row 2'],
        ['CFG-S3', 'Shelf_Location', 'Main Room - Shelf B - Row 1', 'Main Room - Shelf B - Row 1'],
        ['CFG-S4', 'Shelf_Location', 'Study Room - Shelf 1 - Row 1', 'Study Room - Shelf 1 - Row 1'],
        ['CFG-S5', 'Shelf_Location', 'Archival Glass Cabinet', 'Archival Glass Cabinet'],
        ['CFG-W1', 'WhatsApp_Template', 'Book_Taken_Update',
          'Hello [Member_Name]! You have borrowed *"[Book_Title]"* (Accession: [Accession_Number]) on [Issue_Date]. Due date for return is *[Due_Date]*. Happy reading!'],
        ['CFG-W2', 'WhatsApp_Template', 'Pending_Due_Reminder',
          'Hi [Member_Name], friendly reminder from the library! The book *"[Book_Title]"* ([Accession_Number]) is due on *[Due_Date]*. Please let me know if you need an extension.'],
        ['CFG-W3', 'WhatsApp_Template', 'Overdue_Notice',
          'Hi [Member_Name], your borrowed copy of *"[Book_Title]"* ([Accession_Number]) was due on *[Due_Date]*. Kindly return it at your earliest convenience.'],
        ['CFG-W4', 'WhatsApp_Template', 'Malayalam_Notice',
          'നമസ്കാരം [Member_Name], ലൈബ്രറിയിൽ നിന്നുള്ള അറിയിപ്പ്: താങ്കൾ എടുത്ത *"[Book_Title]"* ([Accession_Number]) എന്ന പുസ്തകം തിരികെ നൽകേണ്ട തീയതി *[Due_Date]* ആണ്. നന്ദി!']
      ];
      writeRows_('3_System_Configs', 2, defaultConfigs);
    }

    if (readRows_('4_Members').length <= 1) {
      writeRows_('4_Members', 2, [[
        'MEM-01', 'Library Owner', 'Owner', '', '', 99, 0, 'Active'
      ]]);
    }

    Logger.log('SUCCESS: Library initialized. Database: https://docs.google.com/spreadsheets/d/' +
      props.getProperty('SPREADSHEET_ID') + '/edit');
    Logger.log('Storage: https://drive.google.com/drive/folders/' + rootId);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 2. REST API ROUTERS (doGet & doPost)
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
    const role = (e && e.parameter && e.parameter.role) ? e.parameter.role : 'Guest';

    switch (action) {
      case 'ping':
        return jsonResponse_({ status: 'ok', message: 'Home Library API Online' });
      case 'getInitialSnapshot':
        return jsonResponse_(getInitialSnapshot_(role));
      default:
        return jsonResponse_({ status: 'error', message: 'Unknown GET action: ' + action });
    }
  } catch (err) {
    return jsonResponse_({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    const savedPin = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
    if (savedPin && payload.pin !== savedPin) {
      return jsonResponse_({ status: 'error', code: 401, message: 'Invalid Librarian PIN.' });
    }

    switch (action) {
      case 'analyzeBookPipeline':
        return jsonResponse_(analyzeBookPipeline_(payload.data));
      case 'saveBookAndCopy':
        return jsonResponse_(saveBookAndCopy_(payload.data));
      case 'addPhysicalCopy':
        return jsonResponse_(addPhysicalCopy_(payload.data));
      case 'deleteRecord':
        return jsonResponse_(deleteRecord_(payload.data));
      case 'checkoutBook':
        return jsonResponse_(checkoutBook_(payload.data));
      case 'returnBook':
        return jsonResponse_(returnBook_(payload.data));
      case 'renewLoan':
        return jsonResponse_(renewLoan_(payload.data));
      case 'saveMember':
        return jsonResponse_(saveMember_(payload.data));
      case 'saveSystemConfig':
        return jsonResponse_(saveSystemConfig_(payload.data));
      case 'uploadArchivePdf':
        return jsonResponse_(uploadArchivePdf_(payload.data));
      case 'syncDriveArchive':
        return jsonResponse_(syncDriveArchive_());
      case 'markReminderSent':
        return jsonResponse_(markReminderSent_(payload.txnId));
      default:
        return jsonResponse_({ status: 'error', message: 'Unknown POST action: ' + action });
    }
  } catch (err) {
    return jsonResponse_({ status: 'error', message: err.toString() });
  }
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 3. INITIAL SNAPSHOT LOADER
 */
function getInitialSnapshot_(role) {
  const isGuest = (role === 'Guest');
  const catalog = getTableData_('1_Catalog');
  const copies = getTableData_('2_Copies').map(c => {
    if (isGuest) {
      const clone = { ...c };
      delete clone.Purchase_Price;
      delete clone.Shelf_Location;
      return clone;
    }
    return c;
  });

  const configs = getTableData_('3_System_Configs');
  const digitalArchive = getTableData_('6_Digital_Archive');

  const authorSet = new Set();
  const publisherSet = new Set();
  catalog.forEach(b => {
    if (b.Authors) {
      String(b.Authors).split(',').forEach(a => {
        if (a.trim()) authorSet.add(a.trim());
      });
    }
    if (b.Publisher && String(b.Publisher).trim()) {
      publisherSet.add(String(b.Publisher).trim());
    }
  });

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    catalog: catalog,
    copies: copies,
    configs: configs,
    knownAuthors: Array.from(authorSet).sort(),
    knownPublishers: Array.from(publisherSet).sort(),
    digitalArchive: digitalArchive,
    members: isGuest ? [] : getTableData_('4_Members'),
    transactions: isGuest ? [] : getTableData_('5_Transactions')
  };
}

/**
 * 4. SAVE OR UPDATE BOOK (ALL 24 FIELDS + COVERS + PDF ARCHIVE)
 */
function saveBookAndCopy_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = new Date().toISOString();
    const isUpdate = Boolean(data.Book_ID && data.isEditMode);
    const bookId = data.Book_ID || ('BK-' + Utilities.getUuid().substring(0, 8).toUpperCase());

    let frontCoverUrl = data.Cover_Image_URL || '';
    if (data.frontCoverBase64) {
      frontCoverUrl = saveImageToDrive_(data.frontCoverBase64, `${bookId}_FrontCover.jpg`);
    }

    let backCoverUrl = data.Back_Image_URL || '';
    if (data.backCoverBase64) {
      backCoverUrl = saveImageToDrive_(data.backCoverBase64, `${bookId}_BackCover.jpg`);
    }

    let hasDigital = Boolean(data.Has_Digital_Copy);
    let digitalViewUrl = data.Digital_View_URL || '';
    if (data.pdfBase64) {
      const pdfRes = uploadArchivePdf_({
        Book_ID: bookId,
        Book_Title: data.Title_English,
        fileName: data.pdfFileName || `${data.Title_English || bookId}.pdf`,
        base64Data: data.pdfBase64
      });
      hasDigital = true;
      digitalViewUrl = pdfRes.digitalRecord.Drive_View_URL;
    }

    const callMode = data.Call_Number_Mode || 'Auto';
    const callNumber = generateCallNumber_({ ...data, Call_Number_Mode: callMode });

    const bookRecord = {
      Book_ID: bookId,
      Title_English: data.Title_English || 'Untitled',
      Title_Original: data.Title_Original || '',
      Book_Type: data.Book_Type || 'Normal Book',
      Series_Name: data.Series_Name || '',
      Volume_Number: data.Volume_Number || '',
      Authors: data.Authors || 'Unknown',
      Publisher: data.Publisher || '',
      ISBN: data.ISBN || '',
      Edition: data.Edition || '',
      Language: data.Language || 'English',
      Category_Genre: data.Category_Genre || 'General',
      Publish_Year: data.Publish_Year || '',
      Pages: data.Pages || '',
      Book_Format: data.Book_Format || 'Physical',
      Reading_Status: data.Reading_Status || 'Unread',
      Rating: data.Rating || '',
      Notes_Remarks: data.Notes_Remarks || '',
      Cover_Image_URL: frontCoverUrl,
      Description_Blurb: data.Description_Blurb || '',
      Back_Image_URL: backCoverUrl,
      Call_Number: callNumber,
      Call_Number_Mode: callMode,
      Has_Digital_Copy: hasDigital,
      Digital_View_URL: digitalViewUrl,
      Created_At: data.Created_At || now,
      Updated_At: now
    };

    upsertRow_('1_Catalog', 'Book_ID', bookRecord);

    let copyRecord = null;
    if (!isUpdate) {
      copyRecord = addPhysicalCopy_({
        Book_ID: bookId,
        Book_Title_Ref: bookRecord.Title_English,
        Base_Call_Number: callNumber,
        Shelf_Location: data.Shelf_Location || 'Main Room - Shelf A - Row 1',
        Date_Acquired: data.Date_Acquired || now.substring(0, 10),
        Purchase_Price: data.Purchase_Price || '',
        Book_Condition: data.Book_Condition || 'Good',
        Notes_Remarks: data.Notes_Remarks || '',
        Status: 'Available'
      }).copy;
    } else if (data.Accession_Number) {
      const existingCopies = getTableData_('2_Copies');
      const targetCopy = existingCopies.find(c => c.Accession_Number === data.Accession_Number);
      if (targetCopy) {
        targetCopy.Book_Title_Ref = bookRecord.Title_English;
        targetCopy.Call_Number = data.Copy_Call_Number || `${callNumber} c.1`;
        targetCopy.Shelf_Location = data.Shelf_Location || targetCopy.Shelf_Location;
        targetCopy.Date_Acquired = data.Date_Acquired || targetCopy.Date_Acquired;
        targetCopy.Purchase_Price = data.Purchase_Price !== undefined ? data.Purchase_Price : targetCopy.Purchase_Price;
        targetCopy.Book_Condition = data.Book_Condition || targetCopy.Book_Condition;
        targetCopy.Notes_Remarks = data.Notes_Remarks || targetCopy.Notes_Remarks;
        upsertRow_('2_Copies', 'Accession_Number', targetCopy);
        copyRecord = targetCopy;
      }
    }

    logAudit_(isUpdate ? 'UPDATE_BOOK' : 'CREATE_BOOK', '1_Catalog', bookId, bookRecord);
    return { status: 'ok', book: bookRecord, copy: copyRecord };
  } finally {
    lock.releaseLock();
  }
}

function addPhysicalCopy_(data) {
  const copies = getTableData_('2_Copies');
  const bookCopies = copies.filter(c => c.Book_ID === data.Book_ID);
  const copyIdx = bookCopies.length + 1;

  const props = PropertiesService.getScriptProperties();
  let nextSeq = parseInt(props.getProperty('NEXT_ACCESSION_SEQ') || '1001', 10);
  const accessionNo = data.Accession_Number || ('LIB-' + String(nextSeq).padStart(5, '0'));
  if (!data.Accession_Number) {
    props.setProperty('NEXT_ACCESSION_SEQ', String(nextSeq + 1));
  }

  let baseCall = data.Base_Call_Number || '';
  let titleRef = data.Book_Title_Ref || '';
  if (!baseCall || !titleRef) {
    const book = getTableData_('1_Catalog').find(b => b.Book_ID === data.Book_ID);
    if (book) {
      baseCall = baseCall || book.Call_Number;
      titleRef = titleRef || book.Title_English;
    }
  }

  const copyRecord = {
    Accession_Number: accessionNo,
    Book_ID: data.Book_ID,
    Book_Title_Ref: titleRef,
    Call_Number: data.Call_Number || `${baseCall} c.${copyIdx}`,
    Shelf_Location: data.Shelf_Location || 'Main Room - Shelf A - Row 1',
    Date_Acquired: data.Date_Acquired || new Date().toISOString().substring(0, 10),
    Purchase_Price: data.Purchase_Price || '',
    Book_Condition: data.Book_Condition || 'Good',
    Notes_Remarks: data.Notes_Remarks || '',
    Status: data.Status || 'Available'
  };

  upsertRow_('2_Copies', 'Accession_Number', copyRecord);
  logAudit_('ADD_COPY', '2_Copies', accessionNo, copyRecord);
  return { status: 'ok', copy: copyRecord };
}

function generateCallNumber_(bookData) {
  if (bookData.Call_Number_Mode === 'Manual' && bookData.Call_Number && String(bookData.Call_Number).trim() !== '') {
    return String(bookData.Call_Number).trim();
  }
  if (bookData.Call_Number_Mode === 'DDC' && bookData.Call_Number && String(bookData.Call_Number).trim() !== '') {
    return String(bookData.Call_Number).trim();
  }

  const rawLang = String(bookData.Language || 'ENG').toLowerCase();
  let langCode = 'ENG';
  if (rawLang.includes('malayalam') || rawLang.includes('മലയാളം')) langCode = 'MAL';
  else if (rawLang.includes('arabic') || rawLang.includes('العربية')) langCode = 'ARA';
  else if (rawLang.includes('hindi') || rawLang.includes('हिन्दी')) langCode = 'HIN';
  else langCode = rawLang.replace(/[^a-z]/g, '').substring(0, 3).toUpperCase() || 'GEN';

  const genreCode = String(bookData.Category_Genre || 'GEN').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'GEN';
  const authorParts = String(bookData.Authors || 'AUT').split(',')[0].trim().split(/\s+/);
  const authorCode = (authorParts[authorParts.length - 1] || 'AUT').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'AUT';
  const yr = bookData.Publish_Year ? String(bookData.Publish_Year).substring(0, 4) : 'ND';
  const volSuffix = (bookData.Book_Type !== 'Normal Book' && bookData.Volume_Number) ? `-V${bookData.Volume_Number}` : '';

  return `${langCode}-${genreCode}-${authorCode}-${yr}${volSuffix}`;
}

/**
 * 5. LENDING (CHECK-OUT), RETURN (CHECK-IN) & RENEWAL ENGINE
 */
function checkoutBook_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const copies = getTableData_('2_Copies');
    const catalog = getTableData_('1_Catalog');
    const members = getTableData_('4_Members');

    const copy = copies.find(c => String(c.Accession_Number).trim() === String(data.Accession_Number).trim());
    if (!copy) throw new Error(`Accession Number "${data.Accession_Number}" not found.`);
    if (copy.Status !== 'Available') throw new Error(`Copy "${copy.Accession_Number}" is currently "${copy.Status}".`);

    const book = catalog.find(b => b.Book_ID === copy.Book_ID);
    const member = members.find(m => String(m.Member_ID) === String(data.Member_ID));
    if (!member) throw new Error('Please select a valid Borrower/Member.');

    const issueDate = data.Issue_Date || new Date().toISOString().substring(0, 10);
    const loanDays = Number(data.Loan_Days || 14);
    const dueObj = new Date(issueDate);
    dueObj.setDate(dueObj.getDate() + loanDays);
    const dueDate = data.Due_Date || dueObj.toISOString().substring(0, 10);

    const txnId = 'TXN-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const bookTitle = book ? book.Title_English : (copy.Book_Title_Ref || copy.Book_ID);

    const txnRecord = {
      Txn_ID: txnId,
      Accession_Number: copy.Accession_Number,
      Book_ID: copy.Book_ID,
      Book_Title: bookTitle,
      Call_Number: copy.Call_Number,
      Member_ID: member.Member_ID,
      Member_Name: member.Full_Name,
      Issue_Date: issueDate,
      Due_Date: dueDate,
      Return_Date: '',
      Renewal_Count: 0,
      Issue_Condition: copy.Book_Condition,
      Return_Condition: '',
      Last_Reminded_Date: '',
      Status: 'Active',
      Notes: data.Notes || ''
    };

    upsertRow_('5_Transactions', 'Txn_ID', txnRecord);

    copy.Status = 'Lent';
    upsertRow_('2_Copies', 'Accession_Number', copy);

    member.Active_Loans_Count = Number(member.Active_Loans_Count || 0) + 1;
    upsertRow_('4_Members', 'Member_ID', member);

    logAudit_('CHECKOUT', '5_Transactions', txnId, txnRecord);
    return { status: 'ok', transaction: txnRecord, memberPhone: member.Phone_WhatsApp };
  } finally {
    lock.releaseLock();
  }
}

function returnBook_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const txns = getTableData_('5_Transactions');
    const copies = getTableData_('2_Copies');
    const members = getTableData_('4_Members');

    const activeTxn = txns.find(t =>
      (t.Status === 'Active' || t.Status === 'Overdue') &&
      (String(t.Accession_Number) === String(data.Accession_Number) || String(t.Txn_ID) === String(data.Txn_ID))
    );
    if (!activeTxn) throw new Error(`No active loan found for "${data.Accession_Number}".`);

    const copy = copies.find(c => String(c.Accession_Number) === String(activeTxn.Accession_Number));
    const member = members.find(m => String(m.Member_ID) === String(activeTxn.Member_ID));

    const returnDate = new Date().toISOString().substring(0, 10);
    const returnCond = data.Return_Condition || (copy ? copy.Book_Condition : activeTxn.Issue_Condition);

    activeTxn.Return_Date = returnDate;
    activeTxn.Return_Condition = returnCond;
    activeTxn.Status = 'Returned';
    if (data.Notes) activeTxn.Notes = (activeTxn.Notes ? activeTxn.Notes + ' | ' : '') + data.Notes;
    upsertRow_('5_Transactions', 'Txn_ID', activeTxn);

    if (copy) {
      copy.Book_Condition = returnCond;
      copy.Status = 'Available';
      upsertRow_('2_Copies', 'Accession_Number', copy);
    }

    if (member) {
      member.Active_Loans_Count = Math.max(0, Number(member.Active_Loans_Count || 1) - 1);
      upsertRow_('4_Members', 'Member_ID', member);
    }

    logAudit_('CHECKIN', '5_Transactions', activeTxn.Txn_ID, activeTxn);
    return { status: 'ok', transaction: activeTxn };
  } finally {
    lock.releaseLock();
  }
}

function renewLoan_(data) {
  const txns = getTableData_('5_Transactions');
  const txn = txns.find(t => String(t.Txn_ID) === String(data.Txn_ID));
  if (!txn) throw new Error('Transaction not found.');

  const extraDays = Number(data.Extra_Days || 7);
  const dueObj = new Date(txn.Due_Date || new Date());
  dueObj.setDate(dueObj.getDate() + extraDays);

  txn.Due_Date = dueObj.toISOString().substring(0, 10);
  txn.Renewal_Count = Number(txn.Renewal_Count || 0) + 1;
  upsertRow_('5_Transactions', 'Txn_ID', txn);
  return { status: 'ok', transaction: txn };
}

function markReminderSent_(txnId) {
  const txns = getTableData_('5_Transactions');
  const txn = txns.find(t => t.Txn_ID === txnId);
  if (txn) {
    txn.Last_Reminded_Date = new Date().toISOString().substring(0, 10);
    upsertRow_('5_Transactions', 'Txn_ID', txn);
  }
  return { status: 'ok' };
}

/**
 * 6. AI "AUTO-ADD" PIPELINE (ISBN APIs + GEMINI 2.5 FLASH VISION OCR)
 */
function analyzeBookPipeline_(data) {
  const isbnInput = String(data.isbn || '').replace(/[^0-9X]/gi, '');
  const imagesBase64 = data.images || [];
  const forceAiOcr = Boolean(data.forceAiOcr);

  let apiData = {};
  let aiData = {};

  if (isbnInput) apiData = fetchFromPublicBookAPIs_(isbnInput, '', '');

  const apiFound = Boolean(apiData.Title_English);
  if ((!apiFound || forceAiOcr) && imagesBase64.length > 0) {
    aiData = extractWithGeminiVision_(imagesBase64);
    const detectedIsbn = String(aiData.isbn || '').replace(/[^0-9X]/gi, '');
    if (!apiFound && (detectedIsbn || aiData.title_english)) {
      apiData = fetchFromPublicBookAPIs_(
        detectedIsbn,
        aiData.title_english || '',
        (aiData.authors && aiData.authors[0]) ? aiData.authors[0] : ''
      );
    }
  }

  const aiAuthors = Array.isArray(aiData.authors) ? aiData.authors.join(', ') : (aiData.authors || '');
  const merged = {
    Title_English: apiData.Title_English || aiData.title_english || '',
    Title_Original: aiData.title_original_script || '',
    Book_Type: aiData.series_name ? 'Series' : 'Normal Book',
    Series_Name: aiData.series_name || '',
    Volume_Number: aiData.volume_number || '',
    Authors: apiData.Authors || aiAuthors || '',
    Publisher: apiData.Publisher || aiData.publisher || '',
    ISBN: isbnInput || apiData.ISBN || aiData.isbn || '',
    Edition: aiData.edition || '',
    Language: aiData.language || apiData.Language || 'English',
    Category_Genre: apiData.Category_Genre || aiData.category_genre || 'Fiction & Literature',
    Publish_Year: apiData.Publish_Year || aiData.publish_year || '',
    Pages: apiData.Pages || aiData.pages || '',
    Description_Blurb: aiData.description_blurb || apiData.Description_Blurb || '',
    Purchase_Price: aiData.printed_price || '',
    Cover_Image_URL: apiData.Cover_Image_URL || '',
    Suggested_DDC: apiData.DDC_Suggestion || aiData.suggested_ddc || '800 LIT'
  };

  merged.Call_Number = generateCallNumber_({ ...merged, Call_Number_Mode: 'Auto' });
  merged.Call_Number_Mode = 'Auto';

  return { status: 'ok', book: merged };
}

function fetchFromPublicBookAPIs_(isbn, title, author) {
  const resObj = {};
  try {
    let q = isbn ? `isbn:${isbn}` : `intitle:${encodeURIComponent(title)}`;
    if (!isbn && author) q += `+inauthor:${encodeURIComponent(author)}`;

    const gbRes = UrlFetchApp.fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`, { muteHttpExceptions: true });
    if (gbRes.getResponseCode() === 200) {
      const gbJson = JSON.parse(gbRes.getContentText());
      if (gbJson.items && gbJson.items.length > 0) {
        const info = gbJson.items[0].volumeInfo;
        resObj.Title_English = info.title ? (info.subtitle ? `${info.title}: ${info.subtitle}` : info.title) : '';
        resObj.Authors = (info.authors || []).join(', ');
        resObj.Publisher = info.publisher || '';
        resObj.Publish_Year = info.publishedDate ? info.publishedDate.substring(0, 4) : '';
        resObj.Pages = info.pageCount || '';
        resObj.Category_Genre = (info.categories && info.categories[0]) ? info.categories[0] : '';
        resObj.Description_Blurb = info.description || '';
        resObj.Language = mapIsoLang_(info.language || 'en');
        if (info.imageLinks && info.imageLinks.thumbnail) {
          resObj.Cover_Image_URL = info.imageLinks.thumbnail.replace('http://', 'https://');
        }
        if (info.industryIdentifiers && info.industryIdentifiers.length > 0) {
          resObj.ISBN = info.industryIdentifiers[0].identifier;
        }
      }
    }

    const targetIsbn = isbn || resObj.ISBN;
    if (targetIsbn) {
      const olRes = UrlFetchApp.fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${targetIsbn}&format=json&jscmd=data`, { muteHttpExceptions: true });
      if (olRes.getResponseCode() === 200) {
        const olBook = JSON.parse(olRes.getContentText())[`ISBN:${targetIsbn}`];
        if (olBook) {
          if (!resObj.Title_English) resObj.Title_English = olBook.title || '';
          if (!resObj.Authors && olBook.authors) resObj.Authors = olBook.authors.map(a => a.name).join(', ');
          if (!resObj.Publisher && olBook.publishers) resObj.Publisher = olBook.publishers.map(p => p.name).join(', ');
          if (!resObj.Pages && olBook.number_of_pages) resObj.Pages = olBook.number_of_pages;
          if (!resObj.Cover_Image_URL && olBook.cover) resObj.Cover_Image_URL = olBook.cover.large || olBook.cover.medium || '';
          if (olBook.classifications && olBook.classifications.dewey_decimal_class) {
            resObj.DDC_Suggestion = olBook.classifications.dewey_decimal_class[0];
          }
        }
      }
    }
  } catch (e) {}
  return resObj;
}

function extractWithGeminiVision_(imagesArray) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing in Script Properties.');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const parts = [{
    text: `You are an expert multilingual librarian cataloging books in English, Malayalam (മലയാളം), Arabic (العربية), and Hindi.
Analyze these book photos (front cover, back cover, title page, or copyright page).
Extract:
- 'title_english': English title or accurate English transliteration.
- 'title_original_script': Exact original script title (e.g. Malayalam or Arabic script) if present on cover.
- 'series_name' and 'volume_number' if part of a multi-volume or series set.
- 'authors', 'publisher', 'isbn', 'edition', 'language', 'category_genre', 'publish_year', 'pages', 'printed_price', 'description_blurb', and 'suggested_ddc' (Dewey Decimal code + 3-letter author mark).`
  }];

  imagesArray.forEach(img => {
    parts.push({
      inlineData: {
        mimeType: img.mimeType || 'image/jpeg',
        data: img.base64.replace(/^data:image\/\w+;base64,/, '')
      }
    });
  });

  const payload = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title_english: { type: 'STRING' },
          title_original_script: { type: 'STRING' },
          series_name: { type: 'STRING' },
          volume_number: { type: 'STRING' },
          authors: { type: 'ARRAY', items: { type: 'STRING' } },
          publisher: { type: 'STRING' },
          isbn: { type: 'STRING' },
          edition: { type: 'STRING' },
          language: { type: 'STRING' },
          category_genre: { type: 'STRING' },
          publish_year: { type: 'INTEGER' },
          pages: { type: 'INTEGER' },
          printed_price: { type: 'NUMBER' },
          description_blurb: { type: 'STRING' },
          suggested_ddc: { type: 'STRING' }
        },
        required: ['title_english', 'authors', 'language', 'suggested_ddc']
      }
    }
  };

  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Gemini API Error: ' + res.getContentText());
  return JSON.parse(JSON.parse(res.getContentText()).candidates[0].content.parts[0].text);
}

/**
 * 7. GOOGLE DRIVE UPLOADS (FRONT/BACK COVERS & DIRECT PDF ARCHIVE)
 */
function saveImageToDrive_(base64Str, fileName) {
  const file = uploadLibraryFile_('COVERS_FOLDER_ID', base64Str, 'image/jpeg', fileName);
  return `https://drive.google.com/thumbnail?id=${file.id}&sz=w800`;
}

function uploadArchivePdf_(data) {
  const file = uploadLibraryFile_('ARCHIVE_FOLDER_ID', data.base64Data,
    'application/pdf', data.fileName || 'Archive_Scan.pdf');
  const fileId = file.id;
  const digitalRecord = {
    Digital_ID: 'DIG-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
    Book_ID: data.Book_ID || '',
    Book_Title: data.Book_Title || data.fileName,
    Drive_File_ID: fileId,
    Drive_View_URL: `https://drive.google.com/file/d/${fileId}/preview`,
    Drive_Download_URL: `https://drive.google.com/uc?export=download&id=${fileId}`,
    File_Name: file.name,
    File_Size_MB: (Number(file.size || 0) / (1024 * 1024)).toFixed(2),
    Access_Level: 'Public_View',
    Uploaded_Date: new Date().toISOString().substring(0, 10)
  };

  upsertRow_('6_Digital_Archive', 'Digital_ID', digitalRecord);
  return { status: 'ok', digitalRecord: digitalRecord };
}

function syncDriveArchive_() {
  const folderId = PropertiesService.getScriptProperties().getProperty('ARCHIVE_FOLDER_ID');
  const files = listLibraryFiles_(folderId);
  const existing = getTableData_('6_Digital_Archive');
  const catalog = getTableData_('1_Catalog');
  let added = 0;

  for (const f of files) {
    if (existing.some(e => e.Drive_File_ID === f.id)) continue;
    const baseName = f.name.replace(/\.[^/.]+$/, '').trim();
    const matched = catalog.find(b => baseName.toLowerCase().includes(String(b.Title_English).toLowerCase()));

    const viewUrl = `https://drive.google.com/file/d/${f.id}/preview`;
    if (matched) {
      matched.Has_Digital_Copy = true;
      matched.Digital_View_URL = viewUrl;
      upsertRow_('1_Catalog', 'Book_ID', matched);
    }

    upsertRow_('6_Digital_Archive', 'Digital_ID', {
      Digital_ID: 'DIG-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
      Book_ID: matched ? matched.Book_ID : '',
      Book_Title: matched ? matched.Title_English : baseName,
      Drive_File_ID: f.id,
      Drive_View_URL: viewUrl,
      Drive_Download_URL: `https://drive.google.com/uc?export=download&id=${f.id}`,
      File_Name: f.name,
      File_Size_MB: (Number(f.size || 0) / (1024 * 1024)).toFixed(2),
      Access_Level: 'Public_View',
      Uploaded_Date: new Date().toISOString().substring(0, 10)
    });
    added++;
  }
  return { status: 'ok', newlyLinkedCount: added };
}

/**
 * 8. CONFIGURATIONS, MEMBERS & HELPER FUNCTIONS
 */
function saveSystemConfig_(data) {
  const cfgId = data.Config_ID || ('CFG-' + Utilities.getUuid().substring(0, 6).toUpperCase());
  const record = {
    Config_ID: cfgId,
    Config_Type: data.Config_Type,
    Config_Key: data.Config_Key || data.Config_Value,
    Config_Value: data.Config_Value
  };
  upsertRow_('3_System_Configs', 'Config_ID', record);
  return { status: 'ok', config: record };
}

function saveMember_(data) {
  const memId = data.Member_ID || ('MEM-' + Utilities.getUuid().substring(0, 6).toUpperCase());
  const record = {
    Member_ID: memId,
    Full_Name: data.Full_Name,
    Relationship: data.Relationship || 'Friend',
    Phone_WhatsApp: String(data.Phone_WhatsApp || '').replace(/[^0-9]/g, ''),
    Email: data.Email || '',
    Max_Loan_Limit: data.Max_Loan_Limit || 3,
    Active_Loans_Count: data.Active_Loans_Count || 0,
    Status: 'Active'
  };
  upsertRow_('4_Members', 'Member_ID', record);
  return { status: 'ok', member: record };
}

function deleteRecord_(data) {
  const headers = tableHeaders_(data.table);
  const pkIdx = headers.indexOf(data.pkColumn);
  if (pkIdx < 0) throw new Error('Unknown primary key column.');
  const rows = readRows_(data.table);
  if (rows.length <= 1) return { status: 'error', message: 'Empty table' };
  const idx = rows.slice(1).findIndex(row => String(row[pkIdx]) === String(data.id));
  if (idx !== -1) {
    const metadata = sheetsApi_('?fields=sheets.properties');
    const sheet = metadata.sheets.find(s => s.properties.title === data.table);
    sheetsApi_(':batchUpdate', 'post', { requests: [{ deleteDimension: {
      range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS',
        startIndex: idx + 1, endIndex: idx + 2 }
    } }] });
  }
  return { status: 'ok', deletedId: data.id };
}

function getTableData_(sheetName) {
  tableHeaders_(sheetName);
  const rows = readRows_(sheetName);
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] === undefined ? '' : row[i]; });
    return obj;
  });
}

function upsertRow_(sheetName, pkColumn, recordObj) {
  const headers = tableHeaders_(sheetName);
  const pkIdx = headers.indexOf(pkColumn);
  if (pkIdx < 0) throw new Error('Unknown primary key column.');
  const row = headers.map(h => recordObj[h] === undefined ? '' : recordObj[h]);
  const rows = readRows_(sheetName);
  const idx = rows.slice(1).findIndex(r => String(r[pkIdx]) === String(recordObj[pkColumn]));
  if (idx !== -1) {
    writeRows_(sheetName, idx + 2, [row]);
  } else {
    sheetsApi_('/values/' + encodeURIComponent(quotedSheet_(sheetName)) +
      ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', 'post', { values: [row] });
  }
}

function logAudit_(actionType, targetTable, targetId, detailsObj) {
  try {
    upsertRow_('7_Audit_Log', 'Log_ID', {
      Log_ID: 'LOG-' + Utilities.getUuid().substring(0, 8),
      Timestamp: new Date().toISOString(),
      Action_Type: actionType,
      Target_Table: targetTable,
      Target_ID: targetId,
      Details_JSON: detailsObj ? JSON.stringify(detailsObj) : ''
    });
  } catch (e) {}
}

function mapIsoLang_(code) {
  const map = { 'en': 'English', 'ml': 'Malayalam (മലയാളം)', 'ar': 'Arabic (العربية)', 'hi': 'Hindi (हिन्दी)', 'ta': 'Tamil' };
  return map[String(code).toLowerCase()] || code;
}

/**
 * Per-file Google API access. The built-in Sheets/Drive services require broader
 * scopes, so all library storage goes through REST with drive.file instead.
 * Tokens stay on the server and are never returned by the web app.
 */
function googleApi_(url, method, body, contentType) {
  const options = {
    method: method || 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (body !== undefined) {
    options.contentType = contentType || 'application/json';
    options.payload = contentType ? body : JSON.stringify(body);
  }
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('Google API request failed (' + status + '): ' + text);
  }
  return text ? JSON.parse(text) : {};
}

function requiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(name + ' is missing. Run setupRevampedLMS first.');
  return value;
}

function sheetsApi_(path, method, body) {
  return googleApi_('https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(requiredProperty_('SPREADSHEET_ID')) + path, method, body);
}

function tableHeaders_(name) {
  if (!Object.prototype.hasOwnProperty.call(SCHEMA, name)) throw new Error('Unknown library table.');
  return SCHEMA[name];
}

function quotedSheet_(name) {
  tableHeaders_(name);
  return "'" + name.replace(/'/g, "''") + "'";
}

function readRows_(name) {
  return sheetsApi_('/values/' + encodeURIComponent(quotedSheet_(name)) +
    '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING').values || [];
}

function writeRows_(name, startRow, rows) {
  return sheetsApi_('/values/' + encodeURIComponent(quotedSheet_(name) + '!A' + startRow) +
    '?valueInputOption=RAW', 'put', { values: rows });
}

function ensureLibraryFolder_(property, name, parentId) {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty(property);
  if (saved) {
    // Fail rather than silently replacing inaccessible or deleted storage.
    const folder = googleApi_('https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(saved) + '?fields=id,mimeType,trashed');
    if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error(property + ' must refer to an accessible, non-trashed folder.');
    }
    return saved;
  }
  const metadata = { name: name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) metadata.parents = [parentId];
  const folder = googleApi_('https://www.googleapis.com/drive/v3/files?fields=id', 'post', metadata);
  props.setProperty(property, folder.id);
  return folder.id;
}

function uploadLibraryFile_(folderProperty, base64, mimeType, name) {
  const folderId = requiredProperty_(folderProperty);
  const clean = String(base64).replace(/^data:.*?;base64,/, '');
  // Normalize before using base64 as MIME transfer encoding in the multipart body.
  const encoded = Utilities.base64Encode(Utilities.base64Decode(clean));
  const boundary = 'library_' + Utilities.getUuid();
  const metadata = { name: name, mimeType: mimeType, parents: [folderId] };
  const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: ' + mimeType +
    '\r\nContent-Transfer-Encoding: base64\r\n\r\n' + encoded + '\r\n--' + boundary + '--';
  const file = googleApi_('https://www.googleapis.com/upload/drive/v3/files' +
    '?uploadType=multipart&fields=id,name,size', 'post', body, 'multipart/related; boundary=' + boundary);
  // Preserve the original app's public cover/PDF viewer behavior.
  googleApi_('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) +
    '/permissions', 'post', { type: 'anyone', role: 'reader', allowFileDiscovery: false });
  return file;
}

function listLibraryFiles_(folderId) {
  if (!folderId) throw new Error('Archive folder is missing. Run setupRevampedLMS first.');
  const files = [];
  let pageToken = '';
  do {
    const query = "'" + folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' in parents and trashed = false";
    const page = googleApi_('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) +
      '&fields=nextPageToken,files(id,name,size)&pageSize=1000' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    files.push(...(page.files || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return files;
}
