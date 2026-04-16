const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const BACKUP_FILENAME = 'khazna_vault_backup.json';

export interface DriveFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
}

/**
 * Handles Google OAuth2 flow to get an access token.
 */
export async function getGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          reject(response);
        }
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Searches for the Khazna backup file in Google Drive.
 */
export async function findBackupFile(accessToken: string): Promise<DriveFileInfo | null> {
  const query = `name = '${BACKUP_FILENAME}' and trashed = false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name, modifiedTime)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

/**
 * Uploads the encrypted vault string to Google Drive.
 * If file exists, it updates it; otherwise, creates new.
 */
export async function uploadToDrive(accessToken: string, encryptedContent: string) {
  const existingFile = await findBackupFile(accessToken);
  
  const metadata = {
    name: BACKUP_FILENAME,
    mimeType: 'application/json',
  };

  const file = new Blob([encryptedContent], { type: 'application/json' });
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const url = existingFile 
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const response = await fetch(url, {
    method: existingFile ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload to Google Drive');
  }
  return await response.json();
}

/**
 * Downloads the encrypted vault string from Google Drive.
 */
export async function downloadFromDrive(accessToken: string, fileId: string): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to download from Google Drive');
  }
  
  return await response.text();
}
