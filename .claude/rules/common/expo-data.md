---
description: Expo data packages — expo-file-system (new OOP API), expo-sqlite (vector search, WASM), expo-secure-store, expo-blob
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# Expo Data Packages

## expo-file-system (New OOP API — default since SDK 54)

The legacy `FileSystem.*` function-based API is at `expo-file-system/legacy`. The new `File`/`Directory`/`Paths` API is the default import.

### File

```tsx
import { File, Paths } from 'expo-file-system';

const file = new File(Paths.document, 'notes.txt');

// Properties
file.uri; // read-only, updates after move()
file.name; // file name
file.exists; // boolean
file.size; // bytes or null
file.parentDirectory; // Directory instance

// Methods
file.create();
file.write('Hello world');
file.text(); // read as UTF-8 string
file.base64(); // read as base64
file.copy(destination); // File or Directory
file.move(targetDir); // updates uri in-place
file.rename('new-name.txt');
file.delete();
file.info(); // metadata (size, dates)
```

### Directory

```tsx
import { Directory, Paths } from 'expo-file-system';

const dir = new Directory(Paths.document, 'uploads');

// Properties — same as File (uri, name, exists, size, parentDirectory)

// Methods
dir.create();
dir.list(); // returns (File | Directory)[]
dir.createDirectory('images'); // returns Directory
dir.createFile('photo.jpg', 'image/jpeg'); // returns File
dir.copy(destination);
dir.move(destination);
dir.rename('new-name');
dir.delete(); // recursive
dir.info();
```

### Paths Constants

```tsx
import { Paths } from 'expo-file-system';

Paths.document; // persistent document directory (Directory instance)
Paths.cache; // cache directory (Directory instance)
```

### Migration from Legacy API

| Legacy `FileSystem.*`                                       | New OOP API                          |
| ----------------------------------------------------------- | ------------------------------------ |
| `FileSystem.documentDirectory` (string)                     | `Paths.document` (Directory)         |
| `FileSystem.cacheDirectory` (string)                        | `Paths.cache` (Directory)            |
| `FileSystem.writeAsStringAsync(uri, content)`               | `file.write(content)`                |
| `FileSystem.readAsStringAsync(uri)`                         | `file.text()`                        |
| `FileSystem.readAsStringAsync(uri, { encoding: 'base64' })` | `file.base64()`                      |
| `FileSystem.deleteAsync(uri)`                               | `file.delete()`                      |
| `FileSystem.copyAsync({ from, to })`                        | `file.copy(destination)`             |
| `FileSystem.moveAsync({ from, to })`                        | `file.move(destination)`             |
| `FileSystem.makeDirectoryAsync(uri)`                        | `dir.create()`                       |
| `FileSystem.readDirectoryAsync(uri)`                        | `dir.list()` — returns typed objects |
| `FileSystem.getInfoAsync(uri)`                              | `file.info()`                        |

---

## expo-sqlite (Stable — vector search, WASM, tagged templates)

### Basic Usage

```tsx
import * as SQLite from 'expo-sqlite';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

// Open database
const db = await SQLite.openDatabaseAsync('app.db');

// Queries
await db.execAsync('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)');
const result = await db.runAsync('INSERT INTO users (name) VALUES (?)', 'Alice');
// result.lastInsertRowId, result.changes

const user = await db.getFirstAsync('SELECT * FROM users WHERE id = ?', 1);
const users = await db.getAllAsync('SELECT * FROM users');

// Async iteration (cursor)
for await (const row of db.getEachAsync('SELECT * FROM users')) {
  console.log(row);
}

// Transactions
await db.withTransactionAsync(async () => {
  await db.runAsync('INSERT INTO users (name) VALUES (?)', 'Bob');
  await db.runAsync('INSERT INTO users (name) VALUES (?)', 'Charlie');
});
```

### Tagged Template Literal API (NEW)

```tsx
const sql = db.sql;

// SELECT
const users = await sql<User>`SELECT * FROM users WHERE age > ${21}`;

// Single row
const user = await sql<User>`SELECT * FROM users WHERE id = ${1}`.first();

// Mutable query
const result = await sql`INSERT INTO users (name) VALUES (${'Alice'})`;

// Async iteration
for await (const user of sql<User>`SELECT * FROM users`.each()) { ... }

// Synchronous variants
const syncUsers = sql<User>`SELECT * FROM users`.allSync();
const syncUser = sql<User>`SELECT * FROM users WHERE id = ${1}`.firstSync();
```

### React Integration

```tsx
// App root
<SQLiteProvider databaseName="app.db" onInit={migrateDb}>
  <App />
</SQLiteProvider>;

// Any child
function MyComponent() {
  const db = useSQLiteContext();
  // use db methods
}
```

### Vector Search with sqlite-vec (NEW)

```tsx
// Load bundled sqlite-vec extension
const ext = SQLite.bundledExtensions['sqlite-vec'];
await db.loadExtensionAsync(ext.libPath, ext.entryPoint);

// Create vector table
await db.execAsync(`
  CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
    embedding float[384]
  );
`);

// Insert vectors
await db.runAsync(
  'INSERT INTO embeddings(rowid, embedding) VALUES (?, ?)',
  1, new Float32Array([0.1, 0.2, ...])
);

// KNN search
const results = await db.getAllAsync(`
  SELECT rowid, distance
  FROM embeddings
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT 10
`, queryVector);
```

### Web/WASM Support (NEW)

expo-sqlite works on web via WebAssembly. Same API, requires metro config:

```javascript
// metro.config.js
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};
```

### Other New Methods

```tsx
await db.loadExtensionAsync(libPath, entryPoint); // load any SQLite extension
const data = await db.serializeAsync(); // Uint8Array
const db2 = await SQLite.deserializeDatabaseAsync(data);
await db.closeAsync();
SQLite.addDatabaseChangeListener((event) => {
  // event.tableName, event.rowId, event.typeId
});
```

---

## expo-secure-store (Stable)

```tsx
import * as SecureStore from 'expo-secure-store';

// Async API
await SecureStore.setItemAsync('auth_token', token);
const token = await SecureStore.getItemAsync('auth_token');
await SecureStore.deleteItemAsync('auth_token');

// Synchronous API (stable since SDK 51)
SecureStore.setItem('session_id', id);
const session = SecureStore.getItem('session_id');
SecureStore.deleteItem('session_id');

// Biometric authentication
if (SecureStore.canUseBiometricAuthentication()) {
  await SecureStore.setItemAsync('secret', value, {
    requireAuthentication: true,
    authenticationPrompt: 'Verify identity',
  });
}

// iOS Keychain accessibility
await SecureStore.setItemAsync('offline_token', token, {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  keychainService: 'com.myapp.api', // separate namespace
});

// Check availability
const available = await SecureStore.isAvailableAsync();
```

### Key Constraints

- Keys: alphanumeric + `.` `-` `_` only
- Values: strings only (use `JSON.stringify` for objects)
- Size limit: ~2KB per value on iOS Keychain
- `requireAuthentication`: Android prompts on ALL ops; iOS only on read/update
- **Not supported in Expo Go** with biometric auth — use dev builds

---

## expo-blob (Beta — SDK 54+)

W3C-compliant Blob/File handling for binary data.

```tsx
import { Blob, File } from 'expo-blob';

// Create blob from data
const blob = new Blob(['Hello, world!'], { type: 'text/plain' });

// Create File (extends Blob)
const file = new File([blob], 'hello.txt', { type: 'text/plain' });

// Read blob
const text = await blob.text();
const buffer = await blob.arrayBuffer();

// Slice
const slice = blob.slice(0, 5, 'text/plain');
```

**Status:** Beta. API may change. Use for binary data handling when `expo-file-system` File I/O is insufficient (e.g., FormData uploads, WebSocket binary messages).
