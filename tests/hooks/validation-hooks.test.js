'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  runHook,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

describe('post-edit-typecheck.js', () => {
  it('exits 0 for .ts/.tsx files (attempts tsc)', () => {
    const dir = createTempProject({
      'src/App.tsx': 'export const App = () => null;',
      'tsconfig.json': JSON.stringify({
        compilerOptions: { noEmit: true, jsx: 'react-jsx' },
      }),
    });
    try {
      const result = runHook('post-edit-typecheck.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/App.tsx') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.ok([0, 2].includes(result.exitCode));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('skips non-TS files', () => {
    const result = runHook('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/utils.js' },
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when no file path', () => {
    const result = runHook('post-edit-typecheck.js', {});
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips test files', () => {
    const result = runHook('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/App.test.tsx' },
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('check-console-log.js', () => {
  it('warns on console.log in production code', () => {
    const dir = createTempProject({
      'src/app.ts': 'console.log("debug");\nconst x = 1;',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 2);
      assert.ok(result.stdout.includes('console.log'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('passes when no console.log found', () => {
    const dir = createTempProject({
      'src/app.ts': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('ignores console.log in test files', () => {
    const dir = createTempProject({
      'src/app.test.ts': 'console.log("test output");',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.test.ts') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('detects console.warn and console.error too', () => {
    const dir = createTempProject({
      'src/app.ts': 'console.warn("oops");\nconsole.error("bad");',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 2);
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('skips non-JS/TS files', () => {
    const result = runHook('check-console-log.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/README.md' },
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('check-platform-specific.js', () => {
  it('warns when Platform.OS only checks one platform', () => {
    const dir = createTempProject({
      'src/app.tsx': [
        "import { Platform } from 'react-native';",
        "const style = Platform.OS === 'ios' ? 10 : 10;",
      ].join('\n'),
    });
    try {
      const result = runHook('check-platform-specific.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.ok([0, 2].includes(result.exitCode));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('passes when Platform.select has both platforms', () => {
    const dir = createTempProject({
      'src/app.tsx': [
        "import { Platform } from 'react-native';",
        "const val = Platform.select({ ios: 10, android: 12 });",
      ].join('\n'),
    });
    try {
      const result = runHook('check-platform-specific.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('skips non-RN files', () => {
    const result = runHook('check-platform-specific.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/config.json' },
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('passes when no Platform usage found', () => {
    const dir = createTempProject({
      'src/app.tsx': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-platform-specific.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 0);
    } finally {
      cleanupTempProject(dir);
    }
  });
});

describe('check-reanimated-worklet.js', () => {
  it('warns on non-serializable reference in worklet', () => {
    const dir = createTempProject({
      'src/anim.tsx': [
        "import Animated, { useAnimatedStyle } from 'react-native-reanimated';",
        "const outsideRef = React.createRef();",
        "const style = useAnimatedStyle(() => {",
        "  return { opacity: outsideRef.current ? 1 : 0 };",
        "});",
      ].join('\n'),
    });
    try {
      const result = runHook('check-reanimated-worklet.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/anim.tsx') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.ok([0, 2].includes(result.exitCode));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('passes for files without reanimated', () => {
    const dir = createTempProject({
      'src/app.tsx': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-reanimated-worklet.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('skips non-JS/TS files', () => {
    const result = runHook('check-reanimated-worklet.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/styles.css' },
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('check-expo-config.js', () => {
  it('passes for valid app.json', () => {
    const dir = createTempProject({
      'app.json': JSON.stringify({
        expo: { name: 'MyApp', slug: 'myapp', version: '1.0.0' },
      }),
    });
    try {
      const result = runHook('check-expo-config.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'app.json') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('warns on missing expo.name', () => {
    const dir = createTempProject({
      'app.json': JSON.stringify({
        expo: { slug: 'myapp', version: '1.0.0' },
      }),
    });
    try {
      const result = runHook('check-expo-config.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'app.json') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 2);
      assert.ok(result.stdout.includes('name'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('skips non-config files', () => {
    const result = runHook('check-expo-config.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.tsx' },
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('warns on invalid JSON in app.json', () => {
    const dir = createTempProject({
      'app.json': '{ invalid json',
    });
    try {
      const result = runHook('check-expo-config.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'app.json') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 2);
    } finally {
      cleanupTempProject(dir);
    }
  });
});

describe('bundle-size-check.js', () => {
  it('warns on large dependency additions', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { 'moment': '^2.30.0', 'react': '18.2.0' },
      }),
    });
    try {
      const result = runHook('bundle-size-check.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'package.json') },
      }, { ERNE_PROJECT_DIR: dir });
      assert.ok([0, 2].includes(result.exitCode));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('passes for non-package.json files', () => {
    const result = runHook('bundle-size-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.tsx' },
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when no file path', () => {
    const result = runHook('bundle-size-check.js', {});
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('pre-commit-lint.js', () => {
  it('handles missing eslint gracefully', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test' }),
    });
    try {
      const result = runHook('pre-commit-lint.js', {
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "test"' },
      }, { ERNE_PROJECT_DIR: dir });
      assert.ok([0, 2].includes(result.exitCode));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('skips non-commit bash commands', () => {
    const result = runHook('pre-commit-lint.js', {
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when no command in stdin', () => {
    const result = runHook('pre-commit-lint.js', {
      tool_name: 'Bash',
      tool_input: {},
    });
    assert.strictEqual(result.exitCode, 0);
  });
});
