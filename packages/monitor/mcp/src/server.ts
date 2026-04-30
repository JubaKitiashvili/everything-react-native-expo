// Task 117.2 — MCP server bootstrap.
//
// Wires the tool catalogue + dashboard client into the
// `@modelcontextprotocol/sdk` server, then attaches a stdio transport
// so Claude Desktop can spawn the binary and talk over its pipes.
//
// `createMcpServer()` returns a handle that the tests use to invoke
// tool handlers without needing a live transport. `startMcpServer()`
// is the production entry that the CLI (`bin/erne-monitor-mcp.mjs`)
// calls — it creates the server and connects it to stdio.

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DashboardClient, type DashboardClientOptions } from './client.js';
import { sanitizeString, sanitizeToolInput } from './sanitize.js';
import { TOOL_CATALOGUE, type ToolDefinition } from './tools/index.js';

export interface McpBootstrapOptions extends DashboardClientOptions {
  /**
   * Override the tool catalogue — tests use this to inject a subset or
   * replace a tool with a stub. Production callers leave it unset.
   */
  tools?: ToolDefinition[];
  /** Override the dashboard client — tests inject a fake. */
  client?: DashboardClient;
  /** Optional name shown to the MCP client. */
  name?: string;
  /** Optional version shown to the MCP client. */
  version?: string;
  /**
   * Task 117.81 — emit one audit row per tool call. Off by default
   * because local-dev sessions don't need the trail; enable in
   * production / shared deployments. Set to `true` to use the same
   * dashboard client the tools talk to, or pass an explicit client
   * override here for separate-storage setups.
   */
  audit?: boolean | { client: DashboardClient };
}

export interface McpServerHandle {
  server: McpServer;
  client: DashboardClient;
  /**
   * Directly invoke a registered tool's handler. Bypasses the MCP
   * transport — used by tests to assert on output shapes without
   * spinning stdin/stdout.
   */
  invokeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Names of all registered tools, in catalogue order. */
  listTools(): string[];
}

/**
 * Build the MCP server + register every tool. Does NOT connect to a
 * transport — the caller chooses stdio vs tests vs something else.
 */
export function createMcpServer(options: McpBootstrapOptions): McpServerHandle {
  const client =
    options.client ??
    new DashboardClient({
      dashboardUrl: options.dashboardUrl,
      ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    });

  const server = new McpServer({
    name: options.name ?? '@erne/monitor-mcp',
    version: options.version ?? '0.1.0',
  });

  const catalogue = options.tools ?? TOOL_CATALOGUE;
  const handlerMap = new Map<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  >();

  // Task 117.81 — resolve the audit client. `true` reuses the tool
  // dashboard client; an explicit `{ client }` lets operators route
  // audit writes to a separate destination (read replica, etc.).
  const auditClient: DashboardClient | null =
    options.audit === true
      ? client
      : typeof options.audit === 'object' && options.audit !== null
        ? options.audit.client
        : null;

  /**
   * Best-effort per-tool-call audit. Failures are swallowed because
   * the audit trail is observational — a misbehaving log endpoint
   * must not stop Claude from getting tool results. The `cleaned`
   * argument carries the sanitiser redaction labels we surface as
   * `redactionLabels` on the audit row.
   */
  async function emitToolAudit(
    toolName: string,
    cleaned: ReturnType<typeof sanitizeToolInput>,
    outcome: 'invoked' | 'errored',
    detail?: string,
  ): Promise<void> {
    if (!auditClient) return;
    const labels = new Set<string>();
    for (const r of cleaned.redactions) {
      for (const l of r.labels) labels.add(l);
    }
    try {
      await auditClient.recordAiAction({
        id: randomUUID(),
        timestamp: Date.now(),
        agent: 'mcp-server',
        action: `invoke-tool:${toolName}`,
        outcome,
        toolsCalled: [toolName],
        ...(labels.size > 0 ? { redactionLabels: [...labels] } : {}),
        ...(cleaned.rejections.length > 0
          ? { metadata: { rejections: cleaned.rejections, ...(detail ? { detail } : {}) } }
          : detail
            ? { metadata: { detail } }
            : {}),
      });
    } catch {
      // Swallow — audit is best-effort.
    }
  }

  for (const tool of catalogue) {
    const toolHandler = async (args: Record<string, unknown>): Promise<unknown> => {
      // Task 117.80 — defence-in-depth pass on Claude's args. Zod has
      // already typechecked them, but `string()` doesn't reject zero-
      // width / control / role-prefix payloads. If an identifier-
      // shaped field carried tricks, we refuse to run instead of
      // forwarding a half-cleaned id to the dashboard.
      const cleaned = sanitizeToolInput(args);
      if (cleaned.rejections.length > 0) {
        const err = new Error(
          `tool input rejected: ${cleaned.rejections
            .map((r) => `${r.key}=${r.reason}`)
            .join(', ')}`,
        );
        await emitToolAudit(tool.name, cleaned, 'errored', err.message);
        throw err;
      }
      try {
        const result = await tool.handler(cleaned.sanitized as never, client);
        await emitToolAudit(tool.name, cleaned, 'invoked');
        return result;
      } catch (err) {
        await emitToolAudit(
          tool.name,
          cleaned,
          'errored',
          err instanceof Error ? err.message : String(err),
        );
        throw err;
      }
    };
    handlerMap.set(tool.name, toolHandler);

    server.registerTool(
      tool.name,
      {
        description: `${tool.description}\n\nExample: ${tool.example}`,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await toolHandler(args);
          return {
            content: [
              { type: 'text', text: JSON.stringify(result, null, 2) },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Sanitise the error string — an upstream service may have
          // included an attacker-controlled substring in the message.
          const { text } = sanitizeString(message, 2000);
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Tool \`${tool.name}\` failed: ${text}`,
              },
            ],
          };
        }
      },
    );
  }

  return {
    server,
    client,
    listTools: () => catalogue.map((t) => t.name),
    invokeTool: async (name, args) => {
      const fn = handlerMap.get(name);
      if (!fn) throw new Error(`unknown tool: ${name}`);
      return await fn(args);
    },
  };
}

/**
 * Production entry: build the server and connect it to stdio. Used by
 * `bin/erne-monitor-mcp.mjs`. Resolves when the transport attaches —
 * the process then blocks on stdin, as the MCP SDK handles dispatch
 * internally.
 */
export async function startMcpServer(options: McpBootstrapOptions): Promise<McpServerHandle> {
  const handle = createMcpServer(options);
  const transport = new StdioServerTransport();
  await handle.server.connect(transport);
  return handle;
}
