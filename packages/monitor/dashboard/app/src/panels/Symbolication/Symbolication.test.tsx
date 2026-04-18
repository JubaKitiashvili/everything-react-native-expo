import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResolvedFrame, SymbolFileRecord, SymbolPlatform } from '../../shared/api/types';
import type { UploadSymbolFileInput } from '../../shared/api/client';
import { Symbolication } from './Symbolication';

const NOW = 1_770_000_000_000;

function file(partial: Partial<SymbolFileRecord>): SymbolFileRecord {
  return {
    id: partial.id ?? 's',
    platform: partial.platform ?? 'android',
    bundleId: partial.bundleId ?? 'com.example.app',
    version: partial.version ?? '1.0.0',
    filename: partial.filename ?? 'mapping.txt',
    sizeBytes: partial.sizeBytes ?? 2048,
    uploadedAt: partial.uploadedAt ?? NOW - 60_000,
    entryCount: partial.entryCount ?? 12,
    uuid: partial.uuid ?? null,
    mappingText: partial.mappingText ?? null,
  };
}

describe('Symbolication panel', () => {
  test('renders the empty state when no artefacts have been uploaded', () => {
    render(<Symbolication files={[]} now={NOW} />);
    expect(screen.getByText(/no symbol artefacts uploaded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/upload an artefact first to resolve frames/i)).toBeInTheDocument();
  });

  test('groups uploaded files by signature and exposes delete action per file', async () => {
    const onDelete = vi.fn(async () => undefined);
    render(
      <Symbolication
        files={[
          file({
            id: 'a',
            version: '1.0.0',
            uploadedAt: NOW - 60_000,
            sizeBytes: 1024,
            filename: 'mapping-100.txt',
          }),
          file({
            id: 'b',
            version: '1.0.0',
            uploadedAt: NOW - 10_000,
            sizeBytes: 2048,
            filename: 'mapping-100-hotfix.txt',
          }),
          file({
            id: 'c',
            platform: 'ios',
            version: '1.0.0',
            uploadedAt: NOW - 30_000,
            sizeBytes: 4096,
            filename: 'App.dSYM.zip',
            uuid: 'ABCDEF01-2345-6789-ABCD-EF0123456789',
          }),
        ]}
        now={NOW}
        onDelete={onDelete}
      />,
    );

    // Two rollup rows: ios + android. Sort is by most-recent upload so
    // android/1.0.0 (last upload NOW-10k) sits above ios (NOW-30k).
    const groupList = screen.getByRole('list', { name: /symbol artefact groups/i });
    const groupItems = groupList.querySelectorAll(':scope > li');
    expect(groupItems).toHaveLength(2);
    expect(groupItems[0]!.textContent).toContain('ANDROID');
    expect(groupItems[1]!.textContent).toContain('IOS');
    // Android bundle label appears in the first group header.
    expect(groupItems[0]!.textContent).toContain('com.example.app');

    // Delete button forwards the correct file id.
    const deleteBtn = screen.getByRole('button', { name: /delete mapping-100-hotfix\.txt/i });
    await userEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  test('upload form submits normalised input and resolver round-trips through onResolve', async () => {
    const onUpload = vi.fn(async (input: UploadSymbolFileInput) =>
      file({ id: 'new', ...input, uploadedAt: NOW, entryCount: 3 }),
    );
    const onResolve = vi.fn<
      (args: {
        platform: SymbolPlatform;
        bundleId: string;
        version: string;
        symbol: string;
        fileId?: string;
      }) => Promise<ResolvedFrame>
    >(async ({ platform, bundleId, version, symbol, fileId }) => ({
      input: { platform, bundleId, version, symbol },
      resolved: true,
      symbol: 'com.example.app.MainActivity.onCreate',
      source: { fileId: fileId ?? 'a', platform, version },
    }));

    render(
      <Symbolication
        files={[file({ id: 'a', mappingText: 'com.example.app.MainActivity -> a.b.c:' })]}
        now={NOW}
        onUpload={onUpload}
        onResolve={onResolve}
      />,
    );

    // Change version, then submit — we're only verifying the submitted
    // payload shape, so file-input plumbing stays out of scope.
    await userEvent.clear(screen.getByLabelText(/version/i));
    await userEvent.type(screen.getByLabelText(/version/i), '2.3.4');
    await userEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload.mock.calls[0]![0]).toMatchObject({
      platform: 'android',
      bundleId: 'com.example.app',
      version: '2.3.4',
      filename: 'mapping.txt',
    });

    // Resolver
    await userEvent.clear(screen.getByLabelText(/symbol input/i));
    await userEvent.type(screen.getByLabelText(/symbol input/i), 'a.b.c.e');
    await userEvent.click(screen.getByRole('button', { name: /^resolve$/i }));
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'a.b.c.e',
        platform: 'android',
        fileId: 'a',
      }),
    );
    expect(
      await screen.findByText(/com\.example\.app\.MainActivity\.onCreate/),
    ).toBeInTheDocument();
    expect(screen.getByText(/resolved/i)).toBeInTheDocument();
  });
});
