import { describe, expect, it } from 'vitest';
import { screenForDocumentPath } from './matchFile';

const SCREENS = ['Home', 'Profile', 'Settings'];

describe('screenForDocumentPath', () => {
  it('matches the basename to a screen name', () => {
    expect(screenForDocumentPath('/app/src/Home.tsx', SCREENS)).toBe('Home');
  });

  it('strips the file extension before matching', () => {
    expect(screenForDocumentPath('/x/Profile.jsx', SCREENS)).toBe('Profile');
    expect(screenForDocumentPath('/x/Settings.ts', SCREENS)).toBe('Settings');
  });

  it('matches case-insensitively', () => {
    expect(screenForDocumentPath('/x/home.tsx', SCREENS)).toBe('Home');
    expect(screenForDocumentPath('/x/PROFILE.tsx', SCREENS)).toBe('Profile');
  });

  it('handles Windows path separators', () => {
    expect(screenForDocumentPath('C:\\app\\src\\Home.tsx', SCREENS)).toBe('Home');
  });

  it('matches when the screen name itself carries a path/extension', () => {
    expect(screenForDocumentPath('/x/home.tsx', ['app/home.tsx'])).toBe('app/home.tsx');
  });

  it('returns null when no screen matches the basename', () => {
    expect(screenForDocumentPath('/x/Unknown.tsx', SCREENS)).toBeNull();
  });

  it('returns null for an empty screen list', () => {
    expect(screenForDocumentPath('/x/Home.tsx', [])).toBeNull();
  });

  it('returns null for a nullish/empty path', () => {
    expect(screenForDocumentPath(null, SCREENS)).toBeNull();
    expect(screenForDocumentPath(undefined, SCREENS)).toBeNull();
    expect(screenForDocumentPath('', SCREENS)).toBeNull();
  });

  it('matches a file with no extension', () => {
    expect(screenForDocumentPath('/x/Home', SCREENS)).toBe('Home');
  });
});
