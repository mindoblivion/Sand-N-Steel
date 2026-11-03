export interface DriveFilePage<T> {
  files?: T[];
  nextPageToken?: string;
}

/**
 * Read every page from a paginated Drive files.list endpoint.
 * A repeated token is treated as a protocol error rather than looping forever.
 */
export async function fetchAllDriveFilePages<T>(
  fetchPage: (pageToken?: string) => Promise<DriveFilePage<T>>
): Promise<T[]> {
  const files: T[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    const page = await fetchPage(pageToken);
    if (Array.isArray(page.files)) files.push(...page.files);

    const nextPageToken = page.nextPageToken;
    if (!nextPageToken) break;
    if (seenTokens.has(nextPageToken)) {
      throw new Error('Google Drive returned a repeated page token.');
    }
    seenTokens.add(nextPageToken);
    pageToken = nextPageToken;
  } while (pageToken);

  return files;
}
