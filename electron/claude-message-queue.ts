import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Bridges discrete user message pushes to the SDK's streaming-input mode.
 * Implements AsyncIterable<SDKUserMessage>, suitable as `query({ prompt })`.
 * The generator stays alive until close() is called.
 *
 * Pattern lifted from lgtm-anywhere's MessageQueue.
 */
export class MessageQueue {
  private messages: SDKUserMessage[] = [];
  private waiting: ((msg: SDKUserMessage) => void) | null = null;
  private closed = false;

  push(text: string): void {
    if (this.closed) return;
    const msg: SDKUserMessage = {
      type: 'user',
      session_id: '',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    };
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve(msg);
    } else {
      this.messages.push(msg);
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (!this.closed) {
      if (this.messages.length > 0) {
        yield this.messages.shift()!;
      } else {
        const msg = await new Promise<SDKUserMessage>((resolve) => {
          this.waiting = resolve;
        });
        if (this.closed) break;
        yield msg;
      }
    }
  }

  close(): void {
    this.closed = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      // Push a sentinel so the awaiter unblocks; the closed flag breaks the loop.
      resolve({
        type: 'user',
        session_id: '',
        message: { role: 'user', content: '' },
        parent_tool_use_id: null,
      });
    }
  }
}
