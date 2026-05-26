import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StackFrame } from './StackFrame';
import { parseLocation } from './parseLocation';

describe('parseLocation', () => {
  test('splits file, line, and column', () => {
    expect(parseLocation('src/app/App.tsx:42:17')).toEqual({
      file: 'src/app/App.tsx',
      line: 42,
      column: 17,
    });
  });

  test('accepts a file with only a line number', () => {
    expect(parseLocation('index.js:7')).toEqual({ file: 'index.js', line: 7 });
  });

  test('keeps bare filenames as-is without producing NaN line/column', () => {
    const parsed = parseLocation('<anonymous>');
    expect(parsed.file).toBe('<anonymous>');
    expect(parsed.line).toBeUndefined();
    expect(parsed.column).toBeUndefined();
  });

  test('tolerates Windows-style drive letters without misreading them as columns', () => {
    const parsed = parseLocation('C:\\src\\App.tsx:10:5');
    expect(parsed.file).toBe('C:\\src\\App.tsx');
    expect(parsed.line).toBe(10);
    expect(parsed.column).toBe(5);
  });
});

describe('StackFrame component', () => {
  test('renders the symbol and location text', () => {
    render(<StackFrame symbol="renderList" location="src/components/List.tsx:128:12" resolved />);
    expect(screen.getByText('renderList')).toBeInTheDocument();
    expect(screen.getByText('src/components/List.tsx')).toBeInTheDocument();
    expect(screen.getByText(':128:12')).toBeInTheDocument();
  });
});
