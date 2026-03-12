// tests/add-agent.test.js — Tests for the add-agent command
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { generateTemplate, parseArgs, VALID_ROOMS, KEBAB_CASE_RE } = require('../lib/add-agent');

let tmpDir;

function getTmpAgentsDir() {
  return path.join(tmpDir, '.claude', 'agents');
}

// ─── Module basics ───

describe('add-agent — module', () => {
  it('exports a function', () => {
    const addAgent = require('../lib/add-agent');
    assert.equal(typeof addAgent, 'function');
  });

  it('exports generateTemplate helper', () => {
    assert.equal(typeof generateTemplate, 'function');
  });

  it('exports parseArgs helper', () => {
    assert.equal(typeof parseArgs, 'function');
  });

  it('exports VALID_ROOMS', () => {
    assert.ok(Array.isArray(VALID_ROOMS));
    assert.ok(VALID_ROOMS.includes('development'));
    assert.ok(VALID_ROOMS.includes('code-review'));
    assert.ok(VALID_ROOMS.includes('testing'));
    assert.ok(VALID_ROOMS.includes('conference'));
  });
});

// ─── Template generation ───

describe('add-agent — template generation', () => {
  it('generates valid template with name and room', () => {
    const template = generateTemplate('my-custom-agent', 'development');
    assert.ok(template.includes('---'));
    assert.ok(template.includes('name: my-custom-agent'));
    assert.ok(template.includes('room: development'));
    assert.ok(template.includes('description:'));
    assert.ok(template.includes('My Custom Agent'));
    assert.ok(template.includes('## Your Role'));
    assert.ok(template.includes('## Capabilities'));
    assert.ok(template.includes('## Process'));
    assert.ok(template.includes('## Guidelines'));
    assert.ok(template.includes('## Output Format'));
  });

  it('converts kebab-case to title case in template body', () => {
    const template = generateTemplate('api-specialist', 'testing');
    assert.ok(template.includes('Api Specialist'));
  });

  it('includes frontmatter with name, room, and description', () => {
    const template = generateTemplate('database-expert', 'development');
    const frontmatter = template.split('---')[1];
    assert.ok(frontmatter.includes('name: database-expert'));
    assert.ok(frontmatter.includes('room: development'));
    assert.ok(frontmatter.includes('description:'));
  });

  it('includes room in frontmatter for different rooms', () => {
    const template = generateTemplate('test-agent', 'testing');
    const frontmatter = template.split('---')[1];
    assert.ok(frontmatter.includes('room: testing'));
  });

  it('follows existing agent format with YAML frontmatter', () => {
    const template = generateTemplate('test-agent', 'development');
    // Should start with ---
    assert.ok(template.startsWith('---\n'));
    // Should have closing ---
    const parts = template.split('---');
    assert.ok(parts.length >= 3, 'Should have opening and closing frontmatter delimiters');
  });

  it('includes standard ERNE guidelines', () => {
    const template = generateTemplate('test-agent', 'development');
    assert.ok(template.includes('CLAUDE.md'));
    assert.ok(template.includes('named exports'));
  });
});

// ─── Argument parsing ───

describe('add-agent — argument parsing', () => {
  it('parses agent name from args', () => {
    const result = parseArgs(['node', 'cli.js', 'add-agent', 'my-agent']);
    assert.equal(result.name, 'my-agent');
  });

  it('defaults room to development', () => {
    const result = parseArgs(['node', 'cli.js', 'add-agent', 'my-agent']);
    assert.equal(result.room, 'development');
  });

  it('parses --room flag', () => {
    const result = parseArgs(['node', 'cli.js', 'add-agent', 'my-agent', '--room', 'testing']);
    assert.equal(result.name, 'my-agent');
    assert.equal(result.room, 'testing');
  });

  it('parses --room before name', () => {
    const result = parseArgs(['node', 'cli.js', 'add-agent', '--room', 'code-review', 'my-agent']);
    assert.equal(result.name, 'my-agent');
    assert.equal(result.room, 'code-review');
  });

  it('returns null name when no name provided', () => {
    const result = parseArgs(['node', 'cli.js', 'add-agent']);
    assert.equal(result.name, null);
  });
});

// ─── Kebab-case validation ───

describe('add-agent — name validation', () => {
  it('accepts valid kebab-case names', () => {
    assert.ok(KEBAB_CASE_RE.test('my-agent'));
    assert.ok(KEBAB_CASE_RE.test('api-specialist'));
    assert.ok(KEBAB_CASE_RE.test('database-expert'));
    assert.ok(KEBAB_CASE_RE.test('agent'));
    assert.ok(KEBAB_CASE_RE.test('my-custom-agent'));
    assert.ok(KEBAB_CASE_RE.test('agent2'));
    assert.ok(KEBAB_CASE_RE.test('a1-b2-c3'));
  });

  it('rejects names with uppercase', () => {
    assert.ok(!KEBAB_CASE_RE.test('MyAgent'));
    assert.ok(!KEBAB_CASE_RE.test('myAgent'));
    assert.ok(!KEBAB_CASE_RE.test('AGENT'));
  });

  it('rejects names with spaces', () => {
    assert.ok(!KEBAB_CASE_RE.test('my agent'));
    assert.ok(!KEBAB_CASE_RE.test('my custom agent'));
  });

  it('rejects names with special characters', () => {
    assert.ok(!KEBAB_CASE_RE.test('my_agent'));
    assert.ok(!KEBAB_CASE_RE.test('my.agent'));
    assert.ok(!KEBAB_CASE_RE.test('my@agent'));
  });

  it('rejects names starting with hyphen or number', () => {
    assert.ok(!KEBAB_CASE_RE.test('-my-agent'));
    assert.ok(!KEBAB_CASE_RE.test('1agent'));
  });

  it('rejects names with consecutive hyphens', () => {
    assert.ok(!KEBAB_CASE_RE.test('my--agent'));
  });

  it('rejects names ending with hyphen', () => {
    assert.ok(!KEBAB_CASE_RE.test('my-agent-'));
  });
});

// ─── File creation (integration) ───

describe('add-agent — file creation', () => {
  const TEST_AGENT_NAME = 'test-temp-agent-xyz';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'agents'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates agent file with correct content', () => {
    const template = generateTemplate(TEST_AGENT_NAME, 'development');
    const agentsDir = getTmpAgentsDir();
    const filePath = path.join(agentsDir, `${TEST_AGENT_NAME}.md`);
    fs.writeFileSync(filePath, template, 'utf8');

    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes(`name: ${TEST_AGENT_NAME}`));
    assert.ok(content.includes('## Your Role'));
  });

  it('detects duplicate agent file', () => {
    const agentsDir = getTmpAgentsDir();
    const filePath = path.join(agentsDir, `${TEST_AGENT_NAME}.md`);
    fs.writeFileSync(filePath, 'existing', 'utf8');

    assert.ok(fs.existsSync(filePath), 'File should already exist');
  });
});

// ─── CLI integration ───

describe('add-agent — CLI integration', () => {
  const { execSync } = require('child_process');
  const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');
  const TEST_AGENT = 'cli-test-temp-agent';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates agent via CLI', () => {
    const output = execSync(`node ${CLI_PATH} add-agent ${TEST_AGENT}`, { encoding: 'utf8', cwd: tmpDir });
    assert.ok(output.includes('Agent created'));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'agents', `${TEST_AGENT}.md`)));
  });

  it('errors on missing name', () => {
    assert.throws(() => {
      execSync(`node ${CLI_PATH} add-agent`, { encoding: 'utf8', stdio: 'pipe', cwd: tmpDir });
    });
  });

  it('errors on invalid name with uppercase', () => {
    assert.throws(() => {
      execSync(`node ${CLI_PATH} add-agent MyAgent`, { encoding: 'utf8', stdio: 'pipe', cwd: tmpDir });
    });
  });

  it('errors on duplicate agent', () => {
    // Create first
    execSync(`node ${CLI_PATH} add-agent ${TEST_AGENT}`, { encoding: 'utf8', cwd: tmpDir });
    // Try duplicate
    assert.throws(() => {
      execSync(`node ${CLI_PATH} add-agent ${TEST_AGENT}`, { encoding: 'utf8', stdio: 'pipe', cwd: tmpDir });
    });
  });

  it('accepts --room flag', () => {
    const output = execSync(`node ${CLI_PATH} add-agent ${TEST_AGENT} --room testing`, { encoding: 'utf8', cwd: tmpDir });
    assert.ok(output.includes('Agent created'));
  });

  it('errors on invalid room', () => {
    assert.throws(() => {
      execSync(`node ${CLI_PATH} add-agent ${TEST_AGENT} --room invalid-room`, { encoding: 'utf8', stdio: 'pipe', cwd: tmpDir });
    });
  });

  it('help mentions add-agent', () => {
    const output = execSync(`node ${CLI_PATH} help`, { encoding: 'utf8' });
    assert.ok(output.includes('add-agent'));
  });
});
