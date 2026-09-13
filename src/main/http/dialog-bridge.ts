import { spawn } from "node:child_process";
import type { DialogBridge, DialogRequest, DialogResult } from "./api-types";

const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KiB

export type DialogRunner = (
  request: DialogRequest,
  signal?: AbortSignal,
) => Promise<DialogResult>;

export const createDefaultDialogRunner = (scriptPath: string): DialogRunner => {
  return (request: DialogRequest, signal?: AbortSignal): Promise<DialogResult> => {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Operation aborted"));
        return;
      }

      const child = spawn("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
      ]);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let totalStdoutBytes = 0;
      let totalStderrBytes = 0;
      let killedForOverflow = false;

      const onAbort = () => {
        child.kill();
        reject(new Error("Operation aborted"));
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      child.stdout.on("data", (chunk: Buffer) => {
        totalStdoutBytes += chunk.length;
        if (totalStdoutBytes > MAX_OUTPUT_BYTES) {
          killedForOverflow = true;
          child.kill();
          reject(new Error(`Dialog process stdout exceeded ${MAX_OUTPUT_BYTES} bytes.`));
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        totalStderrBytes += chunk.length;
        if (totalStderrBytes > MAX_OUTPUT_BYTES) {
          killedForOverflow = true;
          child.kill();
          reject(new Error(`Dialog process stderr exceeded ${MAX_OUTPUT_BYTES} bytes.`));
          return;
        }
        stderrChunks.push(chunk);
      });

      child.on("error", (err) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        reject(err);
      });

      child.on("close", (code) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        if (killedForOverflow) return;
        if (signal?.aborted) return;

        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

        if (code !== 0) {
          reject(
            new Error(
              `Dialog process exited with code ${code}${stderr ? `: ${stderr}` : ""}`,
            ),
          );
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          if (typeof parsed !== "object" || parsed === null || typeof parsed.ok !== "boolean") {
            throw new Error(`Invalid dialog output format: ${stdout}`);
          }
          resolve(parsed as DialogResult);
        } catch (error) {
          reject(
            new Error(
              `Failed to parse dialog stdout as JSON: ${error instanceof Error ? error.message : String(error)} (stdout: ${stdout})`,
            ),
          );
        }
      });

      try {
        const stdinPayload = Buffer.from(JSON.stringify(request), "utf8");
        child.stdin.write(stdinPayload);
        child.stdin.end();
      } catch (err) {
        if (signal) signal.removeEventListener("abort", onAbort);
        child.kill();
        reject(err);
      }
    });
  };
};

interface QueuedItem {
  request: DialogRequest;
  signal?: AbortSignal;
  resolve: (res: DialogResult) => void;
  reject: (err: unknown) => void;
  onAbort?: () => void;
}

export class WindowsDialogBridge implements DialogBridge {
  private readonly runner: DialogRunner;
  private readonly queue: QueuedItem[] = [];
  private activeItem: QueuedItem | null = null;
  private isProcessing = false;
  private isDisposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(runnerOrScriptPath: DialogRunner | string) {
    if (typeof runnerOrScriptPath === "function") {
      this.runner = runnerOrScriptPath;
    } else {
      this.runner = createDefaultDialogRunner(runnerOrScriptPath);
    }
  }

  public showDialog(
    request: DialogRequest,
    signal?: AbortSignal,
  ): Promise<DialogResult> {
    if (this.isDisposed) {
      return Promise.reject(new Error("DialogBridge has been disposed."));
    }

    if (signal?.aborted) {
      return Promise.reject(new Error("Operation aborted"));
    }

    return new Promise<DialogResult>((resolve, reject) => {
      const item: QueuedItem = {
        request,
        signal,
        resolve,
        reject,
      };

      if (signal) {
        item.onAbort = () => {
          const index = this.queue.indexOf(item);
          if (index !== -1) {
            this.queue.splice(index, 1);
            reject(new Error("Operation aborted"));
          }
        };
        signal.addEventListener("abort", item.onAbort, { once: true });
      }

      this.queue.push(item);
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift()!;
    this.activeItem = item;

    if (item.signal && item.onAbort) {
      item.signal.removeEventListener("abort", item.onAbort);
    }

    if (item.signal?.aborted) {
      item.reject(new Error("Operation aborted"));
      this.activeItem = null;
      this.isProcessing = false;
      this.processNext();
      return;
    }

    try {
      const result = await this.runner(item.request, item.signal);
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.activeItem = null;
      this.isProcessing = false;
      this.processNext();
    }
  }

  public async dispose(): Promise<void> {
    if (this.disposePromise) {
      return this.disposePromise;
    }

    this.isDisposed = true;

    // Reject all queued items
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (item.signal && item.onAbort) {
        item.signal.removeEventListener("abort", item.onAbort);
      }
      item.reject(new Error("DialogBridge has been disposed."));
    }

    this.disposePromise = (async () => {
      while (this.isProcessing || this.activeItem) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    })();

    return this.disposePromise;
  }
}
