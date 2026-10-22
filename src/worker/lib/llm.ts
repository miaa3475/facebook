import type { Env } from "../types.ts";

/**
 * A minimal client for the OpenCode server (`opencode serve`).
 *
 * The server exposes a flat JSON API:
 *
 *   POST /api/session                      -> { data: { id } }
 *   POST /api/session/{id}/prompt          -> 200, returns the queued user message
 *   GET  /api/session/{id}/message         -> { data: Message[] }
 *
 * The prompt call returns before the model has answered, so the reply is
 * picked up by polling the message list.
 */

export interface LlmConfig {
  baseUrl: string;
  username: string;
  password: string;
  model: { providerID: string; modelID: string } | null;
  directory?: string;
  /** The OpenCode agent that carries the NPC's persona. */
  agent?: string;
}

interface OpenCodeMessage {
  id: string;
  type: "user" | "assistant";
  content?: { type: string; text?: string; error?: unknown }[];
}

export class LlmError extends Error {}

export function llmConfig(env: Env): LlmConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim();
  if (!baseUrl) return null;

  const model = env.LLM_MODEL?.trim();
  let parsed: { providerID: string; modelID: string } | null = null;
  if (model) {
    const slash = model.indexOf("/");
    if (slash > 0) {
      parsed = {
        providerID: model.slice(0, slash),
        modelID: model.slice(slash + 1),
      };
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    username: env.LLM_USERNAME || "opencode",
    password: env.LLM_PASSWORD || "",
    model: parsed,
    directory: env.LLM_DIRECTORY?.trim() || undefined,
    agent: env.LLM_AGENT?.trim() || "npc",
  };
}

export class OpenCodeClient {
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.password) {
      const encoded = btoa(`${this.config.username}:${this.config.password}`);
      headers.Authorization = `Basic ${encoded}`;
    }
    return headers;
  }

  private url(path: string): string {
    const url = new URL(`${this.config.baseUrl}/api${path}`);
    if (this.config.directory) url.searchParams.set("directory", this.config.directory);
    return url.toString();
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(this.url(path), {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new LlmError(`OpenCode ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new LlmError(`OpenCode returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }

  /** Check that the server is reachable. */
  async healthy(): Promise<boolean> {
    try {
      await this.request("GET", "/provider");
      return true;
    } catch {
      return false;
    }
  }

  /** The agents the server knows about. */
  async agents(): Promise<string[]> {
    try {
      const result = (await this.request("GET", "/agent")) as { data?: { id?: string }[] };
      return (result?.data ?? []).map((agent) => String(agent.id ?? "")).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Create a session and return its id.
   *
   * The agent is chosen when the session is created — passing it with the
   * prompt is ignored by the server.
   */
  async createSession(agent?: string): Promise<string> {
    const body: Record<string, unknown> = {};
    if (agent) body.agent = agent;

    const result = (await this.request("POST", "/session", body)) as {
      data?: { id?: string };
    };
    const id = result?.data?.id;
    if (!id) throw new LlmError("OpenCode did not return a session id");
    return id;
  }

  /** How many messages a session currently holds. */
  async messageCount(sessionId: string): Promise<number> {
    const result = (await this.request("GET", `/session/${sessionId}/message`)) as {
      data?: OpenCodeMessage[];
    };
    return result?.data?.length ?? 0;
  }

  /**
   * The id of the most recent assistant message.
   *
   * The server creates the assistant message straight away and fills in the
   * content afterwards, so the id is the only reliable way to tell a new
   * reply apart from the previous one.
   */
  async lastAssistantMessageId(sessionId: string): Promise<string | null> {
    const result = (await this.request("GET", `/session/${sessionId}/message`)) as {
      data?: OpenCodeMessage[];
    };
    const messages = result?.data ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.type === "assistant") return messages[i].id;
    }
    return null;
  }

  /**
   * Queue a message and return the id of the assistant message that was
   * still the latest one before the prompt.
   *
   * The model is only sent when the session has no agent: passing a model
   * makes the server drop the agent's system prompt, which would cost the
   * NPC its personality.
   */
  async prompt(sessionId: string, text: string, options: { withModel?: boolean } = {}): Promise<string | null> {
    const previous = await this.lastAssistantMessageId(sessionId);

    const body: Record<string, unknown> = { text };
    if (options.withModel !== false && this.config.model) body.model = this.config.model;

    await this.request("POST", `/session/${sessionId}/prompt`, body);
    return previous;
  }

  /**
   * Poll for the assistant's answer.
   *
   * `previousId` is the assistant message that was latest before the prompt
   * was queued. A different id means the reply for this turn has started.
   * Returns null when the model failed or the deadline passed.
   */
  async waitForReply(
    sessionId: string,
    previousId: string | null,
    timeoutMs = 22_000,
  ): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const result = (await this.request("GET", `/session/${sessionId}/message`)) as {
        data?: OpenCodeMessage[];
      };
      const messages = result?.data ?? [];

      // Look at the newest assistant message only.
      let latest: OpenCodeMessage | null = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.type === "assistant") {
          latest = messages[i];
          break;
        }
      }
      if (!latest || latest.id === previousId) continue;

      // A failed generation reports an error part — stop waiting.
      const failed = (latest.content ?? []).some(
        (part) => part.type === "error" || (part as { error?: unknown }).error,
      );
      if (failed) return null;

      const text = (latest.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (text) return text;
    }

    return null;
  }
}
