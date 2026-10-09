import { PlayerProfile } from '../types/game';
import { getAccessToken } from './googleAuth';

export interface DriveSaveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  profilePreview?: {
    name: string;
    level: number;
    gold: number;
    fame: number;
    tier: number;
  };
}

const SAVE_FILE_NAME = 'Sand_And_Steel_Gladiator_Save.json';

/**
 * Lists all game backup files from Google Drive
 */
export async function listDriveSaves(): Promise<DriveSaveFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');

  const query = encodeURIComponent(`name contains 'Sand_And_Steel' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size,description)&orderBy=modifiedTime desc`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list Google Drive files: ${errorText}`);
  }

  const data = await response.json();
  const files: DriveSaveFile[] = (data.files || []).map((f: { id: string; name: string; modifiedTime: string; size?: string; description?: string }) => {
    let preview;
    if (f.description) {
      try {
        preview = JSON.parse(f.description);
      } catch {
        // ignore
      }
    }
    return {
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      size: f.size,
      profilePreview: preview,
    };
  });

  return files;
}

/**
 * Uploads or overwrites game save in Google Drive
 */
export async function saveProfileToDrive(profile: PlayerProfile): Promise<DriveSaveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');

  const existingFiles = await listDriveSaves();
  const existingFile = existingFiles.find((f) => f.name === SAVE_FILE_NAME);

  const metadata = {
    name: SAVE_FILE_NAME,
    mimeType: 'application/json',
    description: JSON.stringify({
      name: profile.name,
      level: profile.level,
      gold: profile.gold,
      fame: profile.fame,
      tier: profile.currentTier,
    }),
  };

  const fileContent = JSON.stringify(profile, null, 2);

  // Use multipart upload to send metadata + content
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;

  let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  let method = 'POST';

  if (existingFile) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
    method = 'PATCH';
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive upload failed: ${errText}`);
  }

  const result = await response.json();
  return {
    id: result.id,
    name: result.name,
    modifiedTime: new Date().toISOString(),
    profilePreview: {
      name: profile.name,
      level: profile.level,
      gold: profile.gold,
      fame: profile.fame,
      tier: profile.currentTier,
    },
  };
}

/**
 * Downloads game profile save from Google Drive
 */
export async function loadProfileFromDrive(fileId: string): Promise<PlayerProfile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to download save from Google Drive: ${errText}`);
  }

  const profile: PlayerProfile = await response.json();
  return profile;
}

/**
 * Deletes backup file from Google Drive (with confirmation requirement)
 */
export async function deleteDriveSaveFile(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const errText = await response.text();
    throw new Error(`Failed to delete Google Drive save: ${errText}`);
  }
}
