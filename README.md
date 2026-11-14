# Home Library & Digital Archive

A personal library app built with Google Sheets, Google Drive, Google Apps Script, and a web frontend hosted on GitHub Pages. Based on [skd414/home-library](https://github.com/skd414/home-library).

Features include multilingual cataloging, ISBN scanning, optional Gemini photo recognition, cover cropping, physical copy tracking, lending and returns, WhatsApp reminder links, PDF viewing, printable QR labels, and CSV/JSON export.

This version uses Google's per-file permission (`drive.file`) for its database and uploads. It does not request access to all your Drive files or spreadsheets. The Apps Script timezone is **`America/Chicago`**, which automatically handles CST/CDT.

## 1. Set up Apps Script

1. Create a new standalone project at [script.google.com](https://script.google.com/) and name it **Home Library**. You do not need to create a spreadsheet first.
2. Replace the default `Code.gs` contents with [backend/Code.gs](./backend/Code.gs).
3. Open **Project Settings** and enable **Show appsscript.json manifest file in editor**.
4. Return to the editor and replace the entire manifest with [appsscript.json](./appsscript.json). Save it **before running any function**. It includes the limited permissions, Drive and Sheets service declarations, and Chicago timezone.
5. Leave **Google Cloud Platform (GCP) Project** set to **Default**. Apps Script enables the declared APIs automatically; no separate Cloud project or consent-screen setup is needed.
6. Select **setupRevampedLMS** from the function dropdown and click **Run**. Authorize the requested permissions. It should request access to the files used with this app and permission to connect to external services, rather than all Drive files or all spreadsheets.
7. Open the database and storage links in the **Execution log**.

Setup creates and saves the IDs for:

- **Home_Library_Database**, containing the seven library database tabs.
- **Home_Library_LMS_Storage**, containing **LMS_Covers** and **LMS_Digital_Archive**.

Running setup again reuses these resources.

## 2. Set your PIN and optional Gemini key

In **Project Settings → Script Properties**, add:

| Property | Value |
| --- | --- |
| `ADMIN_PIN` | Your secret librarian PIN, required for write actions. |
| `GEMINI_API_KEY` | Optional key from [Google AI Studio](https://aistudio.google.com/apikey), used for photo recognition. |

Click **Save script properties**.

## 3. Deploy the backend

1. Click **Deploy → New deployment** and select **Web app**.
2. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
3. Click **Deploy** and copy the web app URL ending in `/exec`.

## 4. Host the frontend

1. Upload `index.html`, `manifest.json`, `sw.js`, and `icon.png` to the root of your GitHub repository.
2. Open the repository's **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**, then **main** and **/ (root)**. Click **Save**.
4. Open the website URL shown on the Pages settings screen once deployment finishes.

## 5. Connect the app

1. Open your website and click **Login**.
2. Enter your Apps Script `/exec` URL and `ADMIN_PIN`, then click **Save & Connect**.
3. Use the browser's install option to install the app if desired.

## File access and existing data

Upload covers and PDFs through the library app. Files added manually through the Drive website are not automatically authorized and will not appear in archive sync. Pasting an existing spreadsheet or folder ID into Script Properties does not grant access. To migrate catalog data, copy the data into the new database's matching tabs, preserving the headers.

The database and storage folders are private. Uploaded covers and PDFs retain the original app's anyone-with-the-link sharing for its public catalog and PDF viewer. Photo recognition sends the supplied photos to Gemini when used.

If you previously authorized the original app, revoke its old grant under [Google Account connections](https://myaccount.google.com/connections) if you no longer use it. This clone does not revoke that grant automatically.

## Local checks

Run `node --test tests/per-file-access.test.cjs` from this repository. The tests use simulated Google APIs; live authorization and deployment must be checked in your Google account.
