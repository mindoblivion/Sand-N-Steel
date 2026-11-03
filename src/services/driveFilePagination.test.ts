// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { fetchAllDriveFilePages } from './driveFilePagination';

describe('Google Drive file pagination', () => {
  test('collects every page in order and forwards each next-page token', async () => {
    const requested: (string | undefined)[] = [];
    const pages = new Map<string | undefined, { files?: { id: string }[]; nextPageToken?: string }>([
      [undefined, { files: [{ id: 'a' }], nextPageToken: 'page-2' }],
      ['page-2', { files: [{ id: 'b' }, { id: 'c' }], nextPageToken: 'page-3' }],
      ['page-3', { files: [{ id: 'd' }] }],
    ]);

    const files = await fetchAllDriveFilePages(async (token) => {
      requested.push(token);
      return pages.get(token) ?? {};
    });

    expect(files.map((file) => file.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(requested).toEqual([undefined, 'page-2', 'page-3']);
  });

  test('returns an empty list when Drive has no files', async () => {
    expect(await fetchAllDriveFilePages(async () => ({ files: [] }))).toEqual([]);
  });

  test('rejects a repeated page token instead of looping indefinitely', async () => {
    await expect(
      fetchAllDriveFilePages(async () => ({ files: [], nextPageToken: 'repeat' }))
    ).rejects.toThrow('repeated page token');
  });
});
