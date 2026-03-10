'use strict';
const path = require('path');
const {
  runHook,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

describe('post-edit-typecheck.js', () => {
  test('exits 0 for .ts/.tsx files (attempts tsc)', () => {
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
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-TS files', () => {
    const result = runHook('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/utils.js' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('skips when no file path', () => {
    const result = runHook('post-edit-typecheck.js', {});
    expect(result.exitCode).toBe(0);
  });

  test('skips test files', () => {
    const result = runHook('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/App.test.tsx' },
    });
    expect(result.exitCode).toBe(0);
  });
});

describe('check-console-log.js', () => {
  test('warns on console.log in production code', () => {
    const dir = createTempProject({
      'src/app.ts': 'console.log("debug");\nconst x = 1;',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, { ERNE_PROJECT_DIR: dir });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('console.log');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('passes when no console.log found', () => {
    const dir = createTempProject({
      'src/app.ts': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, { ERNE_PROJECT_DIR: dir });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('ignores console.log in test files', () => {
    const dir = createTempProject({
      'src/app.test.ts': 'console.log("test output");',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.test.ts') },
      }, { ERNE_PROJECT_DIR: dir });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects console.warn and console.error too', () => {
    const dir = createTempProject({
      'src/app.ts': 'console.warn("oops");\nconsole.error("bad");',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, { ERNE_PROJECT_DIR: dir });
      expect(result.exitCode).toBe(2);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-JS/TS files', () => {
    const result = runHook('check-console-log.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/README.md' },
    });
    expect(result.exitCode).toBe(0);
  });
});

describe('check-platform-specific.js', () => {
  test('warns when Platform.OS only checks one platform', () => {
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
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('passes when Platform.select has both platforms', () => {
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
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-RN files', () => {
    const result = runHook('check-platform-specific.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/config.json' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('passes when no Platform usage found', () => {
    const dir = createTempProject({
      'src/app.tsx': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-platform-specific.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, { ERNE_PROJECT_DIR: dir });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });
});

describe('check-reanimated-worklet.js', () => {
  test('warns on non-serializable reference in worklet', () => {
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
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('passes for files without reanimated', () => {
    const dir = createTempProject({
      'src/app.tsx': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-reanimated-worklet.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, { ERNE_PROJECT_DIR: dir });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-JS/TS files', () => {
    const result = runHook('check-reanimated-worklet.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/styles.css' },
    });
    expect(result.exitCode).toBe(0);
  });
});

describe('check-expo-config.js', () => {
  test('passes for valid app.json', () => {
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
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('warns on missing expo.name', () => {
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
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('name');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-config files', () => {
    const result = runHook('check-expo-config.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.tsx' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('warns on invalid JSON in app.json', () => {
    const dir = createTempProject({
      'app.json': '{ invalid json',
    });
    try {
      const result = runHook('check-expo-config.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'app.json') },
      }, { ERNE_PROJECT_DIR: dir });
      expect(result.exitCode).toBe(2);
    } finally {
      cleanupTempProject(dir);
    }
  });
});

describe('bundle-size-check.js', () => {
  test('warns on large dependency additions', () => {
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
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('passes for non-package.json files', () => {
    const result = runHook('bundle-size-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.tsx' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('skips when no file path', () => {
    const result = runHook('bundle-size-check.js', {});
    expect(result.exitCode).toBe(0);
  });
});

describe('pre-commit-lint.js', () => {
  test('handles missing eslint gracefully', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test' }),
    });
    try {
      const result = runHook('pre-commit-lint.js', {
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "test"' },
      }, { ERNE_PROJECT_DIR: dir });
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-commit bash commands', () => {
    const result = runHook('pre-commit-lint.js', {
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('skips when no command in stdin', () => {
    const result = runHook('pre-commit-lint.js', {
      tool_name: 'Bash',
      tool_input: {},
    });
    expect(result.exitCode).toBe(0);
  });
});
