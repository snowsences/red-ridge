# Red Ridge Clipper

## Install
1. Extract the ZIP to a folder you will keep on your computer.
2. Open chrome://extensions and enable Developer mode.
3. Click Load unpacked and choose the extracted red-ridge-clipper folder (the one containing manifest.json).
4. Pin Red Ridge Clipper using Chrome's Extensions menu.
5. Open https://snowsences.github.io/red-ridge/, refresh it, and sign in with your usual Google account.

## Clip a note
Select a passage, then right-click → Send to Red Ridge, or click the extension icon.
Edit the title and text. Category defaults to General; choose an existing category or type a new one.
The source URL can be included or unchecked. Click Send to Red Ridge.
The note is saved to Notes and synced through Red Ridge's existing Firebase session.

Red Ridge opens in a background tab if needed. If it needs a login, sign in there and return to the clipping window to retry.
The extension confirms success only after the server accepts the note. Internet access is required to send.

## Drafts and retries
Edits are saved on this computer as you type. To reopen the latest unsent draft, click the extension icon with no text selected.
A failed or delayed send preserves the draft. Retrying uses the same note ID so it cannot create a second note.
You may leave the window open after sending or close it yourself. Open Red Ridge jumps to the app.

## Permissions
The extension reads the current selection when you use it and has permanent access only to your Red Ridge URL.
It does not require another Firebase login, an API key, or Cloudinary. Chrome internal pages restrict selection capture; use the right-click menu where available or paste text into the editor.

## Validation
Automated logic tests cover selection capture, draft recovery, categories, note saving, unsafe text escaping, validation, offline/sign-in errors, retries, duplicate prevention, and extension-message validation. JavaScript syntax checks pass.
A live Chrome installation and a real authenticated Firebase write could not be tested in the build environment.
