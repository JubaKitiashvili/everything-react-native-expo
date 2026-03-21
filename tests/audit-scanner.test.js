// tests/audit-scanner.test.js — Tests for audit scanner modules
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const scanStructure = require('../lib/scanners/structure');
const scanDependencies = require('../lib/scanners/dependencies');
const scanDeadCode = require('../lib/scanners/dead-code');
const scanTechDebt = require('../lib/scanners/tech-debt');
const scanTypeSafety = require('../lib/scanners/type-safety');
const scanConfig = require('../lib/scanners/config');

describe('structure scanner', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-structure-'));
    // Create a known file tree
    fs.mkdirSync(path.join(tmpDir, 'src', 'components'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'components', 'Button.tsx'), 'export const Button = () => null;');
    fs.writeFileSync(path.join(tmpDir, 'src', 'components', 'Card.tsx'), 'export const Card = () => null;');
    fs.writeFileSync(path.join(tmpDir, 'src', 'hooks', 'useAuth.ts'), 'export const useAuth = () => {};');
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export {};');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Hello');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns correct total source file count', () => {
    const result = scanStructure(tmpDir);
    assert.strictEqual(result.totalSourceFiles, 4);
  });

  it('returns source files as relative paths', () => {
    const result = scanStructure(tmpDir);
    assert.strictEqual(result.sourceFiles.length, 4);
    for (const f of result.sourceFiles) {
      assert.ok(!path.isAbsolute(f), `should be relative: ${f}`);
      assert.ok(/\.[jt]sx?$/.test(f), `should be a source file: ${f}`);
    }
  });

  it('excludes non-source files', () => {
    const result = scanStructure(tmpDir);
    const hasReadme = result.sourceFiles.some((f) => f.includes('README'));
    assert.ok(!hasReadme, 'should not include README.md');
  });

  it('populates dirCounts for directories with source files', () => {
    const result = scanStructure(tmpDir);
    const componentDir = Object.keys(result.dirCounts).find((d) => d.includes('components'));
    assert.ok(componentDir, 'should have components dir count');
    assert.strictEqual(result.dirCounts[componentDir], 2);
  });

  it('returns a tree object', () => {
    const result = scanStructure(tmpDir);
    assert.ok(result.tree);
    assert.strictEqual(result.tree.type, 'dir');
    assert.ok(Array.isArray(result.tree.children));
  });
});

describe('dependencies scanner', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-deps-'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        dependencies: {
          react: '18.2.0',
          'react-native': '0.76.0',
          expo: '~52.0.0',
          zustand: '^4.0.0',
          'expo-router': '~4.0.0',
        },
        devDependencies: {
          jest: '^29.0.0',
          typescript: '^5.0.0',
        },
      })
    );
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all dependencies merged', () => {
    const result = scanDependencies(tmpDir);
    assert.ok(result);
    assert.strictEqual(result.totalCount, 7);
  });

  it('categorizes zustand as state', () => {
    const result = scanDependencies(tmpDir);
    assert.ok(result.categorized.state.zustand);
  });

  it('categorizes expo-router as navigation', () => {
    const result = scanDependencies(tmpDir);
    assert.ok(result.categorized.navigation['expo-router']);
  });

  it('categorizes jest as testing', () => {
    const result = scanDependencies(tmpDir);
    assert.ok(result.categorized.testing.jest);
  });

  it('categorizes react and expo as framework', () => {
    const result = scanDependencies(tmpDir);
    assert.ok(result.categorized.framework.react);
    assert.ok(result.categorized.framework.expo);
    assert.ok(result.categorized.framework['react-native']);
  });

  it('lists devDeps names', () => {
    const result = scanDependencies(tmpDir);
    assert.ok(result.devDeps.includes('jest'));
    assert.ok(result.devDeps.includes('typescript'));
  });

  it('returns null when no package.json', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-no-pkg-'));
    const result = scanDependencies(emptyDir);
    assert.strictEqual(result, null);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe('dead code scanner', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-deadcode-'));
    // File A exports a function that nobody imports
    fs.writeFileSync(
      path.join(tmpDir, 'unused.ts'),
      'export const unusedHelper = () => 42;\nexport const alsoUnused = () => 99;\n'
    );
    // File B exports a function that File C imports
    fs.writeFileSync(
      path.join(tmpDir, 'used.ts'),
      'export const usedHelper = () => 1;\n'
    );
    // File C imports from File B
    fs.writeFileSync(
      path.join(tmpDir, 'consumer.ts'),
      "import { usedHelper } from './used';\nconsole.log(usedHelper());\n"
    );
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects unused exports as dead code', () => {
    const sourceFiles = ['unused.ts', 'used.ts', 'consumer.ts'];
    const result = scanDeadCode(tmpDir, sourceFiles);
    const deadNames = result.deadExports.map((d) => d.name);
    assert.ok(deadNames.includes('unusedHelper'), 'should detect unusedHelper');
    assert.ok(deadNames.includes('alsoUnused'), 'should detect alsoUnused');
  });

  it('does not flag used exports as dead', () => {
    const sourceFiles = ['unused.ts', 'used.ts', 'consumer.ts'];
    const result = scanDeadCode(tmpDir, sourceFiles);
    const deadNames = result.deadExports.map((d) => d.name);
    assert.ok(!deadNames.includes('usedHelper'), 'should not flag usedHelper');
  });

  it('includes file path in dead export entries', () => {
    const sourceFiles = ['unused.ts', 'used.ts', 'consumer.ts'];
    const result = scanDeadCode(tmpDir, sourceFiles);
    const entry = result.deadExports.find((d) => d.name === 'unusedHelper');
    assert.ok(entry);
    assert.strictEqual(entry.file, 'unused.ts');
  });
});

describe('tech debt scanner', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-techdebt-'));
    fs.writeFileSync(
      path.join(tmpDir, 'messy.ts'),
      [
        'const x = 1;',
        '// TODO: refactor this later',
        'const y = 2;',
        '// FIXME: broken on Android',
        'const z = 3;',
        '// HACK: workaround for RN bug',
        'export {};',
      ].join('\n')
    );
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds all 3 tech debt categories', () => {
    const result = scanTechDebt(tmpDir, ['messy.ts']);
    assert.strictEqual(result.summary.todo, 1);
    assert.strictEqual(result.summary.fixme, 1);
    assert.strictEqual(result.summary.hack, 1);
    assert.strictEqual(result.summary.total, 3);
  });

  it('returns correct line numbers', () => {
    const result = scanTechDebt(tmpDir, ['messy.ts']);
    const todo = result.items.find((i) => i.category === 'todo');
    assert.strictEqual(todo.line, 2);
    const fixme = result.items.find((i) => i.category === 'fixme');
    assert.strictEqual(fixme.line, 4);
    const hack = result.items.find((i) => i.category === 'hack');
    assert.strictEqual(hack.line, 6);
  });

  it('extracts comment text', () => {
    const result = scanTechDebt(tmpDir, ['messy.ts']);
    const todo = result.items.find((i) => i.category === 'todo');
    assert.ok(todo.text.includes('refactor this later'));
  });

  it('includes file path in items', () => {
    const result = scanTechDebt(tmpDir, ['messy.ts']);
    for (const item of result.items) {
      assert.strictEqual(item.file, 'messy.ts');
    }
  });
});

describe('type safety scanner', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-typesafety-'));
    fs.writeFileSync(
      path.join(tmpDir, 'loose.ts'),
      [
        'const x: any = 1;',
        'const y = x as any;',
        'function foo(bar: string): number { return 1; }',
        'const z: any = "hello";',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(tmpDir, 'strict.ts'),
      [
        'const a: string = "typed";',
        'const b: number = 42;',
        'export {};',
      ].join('\n')
    );
    // Non-TS file should be skipped
    fs.writeFileSync(path.join(tmpDir, 'plain.js'), 'const x = 1;');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('counts any usages correctly', () => {
    const result = scanTypeSafety(tmpDir, ['loose.ts', 'strict.ts', 'plain.js']);
    assert.strictEqual(result.summary.totalAnyUsages, 3);
  });

  it('only scans .ts/.tsx files', () => {
    const result = scanTypeSafety(tmpDir, ['loose.ts', 'strict.ts', 'plain.js']);
    assert.strictEqual(result.summary.totalTsFiles, 2);
  });

  it('reports files with any', () => {
    const result = scanTypeSafety(tmpDir, ['loose.ts', 'strict.ts', 'plain.js']);
    assert.strictEqual(result.summary.filesWithAny, 1);
  });

  it('calculates coverage percent', () => {
    const result = scanTypeSafety(tmpDir, ['loose.ts', 'strict.ts', 'plain.js']);
    // 1 out of 2 TS files has any → (2-1)/2 = 50%
    assert.strictEqual(result.summary.coveragePercent, 50);
  });

  it('includes per-file details for files with any', () => {
    const result = scanTypeSafety(tmpDir, ['loose.ts', 'strict.ts', 'plain.js']);
    assert.strictEqual(result.perFile.length, 1);
    assert.strictEqual(result.perFile[0].file, 'loose.ts');
    assert.strictEqual(result.perFile[0].anyCount, 3);
  });
});

describe('diff logic', () => {
  it('detects added and removed items between two audit snapshots', () => {
    // Replicate the core diff logic from audit-cli.js diffNamedList
    function diffNamedList(prevData, currData, key, nameField) {
      const prevNames = new Set();
      const currNames = new Set();

      if (prevData && prevData[key]) {
        for (const item of prevData[key]) {
          prevNames.add(item[nameField] || '');
        }
      }
      if (currData && currData[key]) {
        for (const item of currData[key]) {
          currNames.add(item[nameField] || '');
        }
      }

      const added = [...currNames].filter((n) => !prevNames.has(n));
      const removed = [...prevNames].filter((n) => !currNames.has(n));
      return { added, removed };
    }

    const previous = {
      components: {
        components: [
          { name: 'Button' },
          { name: 'Card' },
          { name: 'OldWidget' },
        ],
      },
    };

    const current = {
      components: {
        components: [
          { name: 'Button' },
          { name: 'Card' },
          { name: 'NewModal' },
        ],
      },
    };

    const diff = diffNamedList(previous.components, current.components, 'components', 'name');
    assert.deepStrictEqual(diff.added, ['NewModal']);
    assert.deepStrictEqual(diff.removed, ['OldWidget']);
  });

  it('returns empty arrays when no changes', () => {
    function diffNamedList(prevData, currData, key, nameField) {
      const prevNames = new Set();
      const currNames = new Set();
      if (prevData && prevData[key]) {
        for (const item of prevData[key]) prevNames.add(item[nameField] || '');
      }
      if (currData && currData[key]) {
        for (const item of currData[key]) currNames.add(item[nameField] || '');
      }
      return {
        added: [...currNames].filter((n) => !prevNames.has(n)),
        removed: [...prevNames].filter((n) => !currNames.has(n)),
      };
    }

    const data = { hooks: [{ name: 'useAuth' }, { name: 'useTheme' }] };
    const diff = diffNamedList(data, data, 'hooks', 'name');
    assert.deepStrictEqual(diff.added, []);
    assert.deepStrictEqual(diff.removed, []);
  });
});

describe('config scanner', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-config-'));
    fs.writeFileSync(
      path.join(tmpDir, 'app.json'),
      JSON.stringify({
        expo: {
          name: 'TestApp',
          slug: 'test-app',
          version: '1.0.0',
        },
      })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'esnext',
        },
      })
    );
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses app.json correctly', () => {
    const result = scanConfig(tmpDir);
    assert.ok(result.appJson);
    assert.strictEqual(result.appJson.expo.name, 'TestApp');
    assert.strictEqual(result.appJson.expo.slug, 'test-app');
  });

  it('parses tsconfig.json correctly', () => {
    const result = scanConfig(tmpDir);
    assert.ok(result.tsconfig);
    assert.strictEqual(result.tsconfig.compilerOptions.strict, true);
    assert.strictEqual(result.tsconfig.compilerOptions.target, 'esnext');
  });

  it('returns null for missing config files', () => {
    const result = scanConfig(tmpDir);
    assert.strictEqual(result.metro, null);
    assert.strictEqual(result.babel, null);
  });

  it('returns empty envVars when no .env.example', () => {
    const result = scanConfig(tmpDir);
    assert.deepStrictEqual(result.envVars, []);
  });

  it('parses .env.example when present', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.env.example'),
      '# Comment line\nAPI_URL=https://example.com\nSECRET_KEY=changeme\n'
    );
    const result = scanConfig(tmpDir);
    assert.deepStrictEqual(result.envVars, ['API_URL', 'SECRET_KEY']);
    fs.unlinkSync(path.join(tmpDir, '.env.example'));
  });
});
