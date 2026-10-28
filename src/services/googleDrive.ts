import { PlayerProfile } from '../types/game';
import { getAccessToken } from './googleAuth';
import { normalizeGold } from '../utils/currency';

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

export class DriveApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
  }
}

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
    throw new DriveApiError(`Failed to list Google Drive files: ${errorText}`, response.status);
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
export async function saveProfileToDrive(
  profile: PlayerProfile,
  options?: { confirmedReplaceFileId?: string }
): Promise<DriveSaveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');

  const existingFiles = await listDriveSaves();
  const existingFile = existingFiles.find((f) => f.name === SAVE_FILE_NAME);

  // Conflict guard: an existing save may only be replaced when the caller
  // provides the specific file ID the user explicitly confirmed to replace.
  if (existingFile) {
    const confirmedId = options?.confirmedReplaceFileId;
    if (!confirmedId) {
      // Ordinary backup discovered an unexpected save — refuse to overwrite.
      throw new DriveApiError(
        'A cloud save already exists on your Google Drive. Refresh your save list and confirm the replacement before backing up.',
        409
      );
    }
    if (existingFile.id !== confirmedId) {
      // The save found by the fresh lookup differs from what the user confirmed
      // (another device may have created or replaced it). Refuse to overwrite.
      throw new DriveApiError(
        'A different cloud save was found on your Google Drive since you last refreshed. Refresh your save list and confirm the replacement before backing up.',
        409
      );
    }
  } else if (options?.confirmedReplaceFileId) {
    // The user confirmed replacing a specific file, but the fresh lookup
    // found no matching save. Don't silently create a new file — the user
    // authorized a replacement, not a new save. Raise a conflict so the
    // user can review the refreshed list and decide how to proceed.
    throw new DriveApiError(
      'The cloud save you confirmed to replace is no longer available on your Google Drive. Refresh your save list and try again.',
      409
    );
  }

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
    throw new DriveApiError(`Google Drive upload failed: ${errText}`, response.status);
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
    throw new DriveApiError(`Failed to download save from Google Drive: ${errText}`, response.status);
  }

  const profile: PlayerProfile = await response.json();
  // Gold/NaN — the same boundary `loadSavedProfile` applies locally: a cloud save written
  // by another build can carry no `gold` at all, and an unusable purse must read as 0
  // rather than reach the duel settlement as `undefined` (see utils/currency.ts).
  return { ...profile, gold: normalizeGold(profile.gold) };
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
    throw new DriveApiError(`Failed to delete Google Drive save: ${errText}`, response.status);
  }
}
