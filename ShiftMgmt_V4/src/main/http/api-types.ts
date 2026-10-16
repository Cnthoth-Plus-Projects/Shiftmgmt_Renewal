import type { IncomingHttpHeaders } from "node:http";
import type { AuthSession } from "../../shared/domain/model";
import type { ChannelContractMeta } from "../../shared/bridge/channel-contracts";

export interface DialogRequest {
  operation: "openFile" | "openFolder" | "saveFile" | "openPath";
  title?: string;
  defaultPath?: string;
  filters?: readonly { name: string; extensions: readonly string[] }[];
  showOverwriteConfirmation?: boolean;
  path?: string;
}

export interface DialogResult {
  ok: boolean;
  cancelled?: boolean;
  path?: string;
}

export interface DialogBridge {
  showDialog(request: DialogRequest, signal?: AbortSignal): Promise<DialogResult>;
  dispose(): Promise<void>;
}

export interface ActivityRecordInput {
  actionType: string;
  actionLabel: string;
  routeKey?: string;
  routeLabel?: string;
  details?: string;
}

export interface RequestContext {
  readonly headers: IncomingHttpHeaders;
  readonly cookie?: string;
  readonly signal: AbortSignal;
  readonly version: string;
  readonly dataDir: string;
  readonly session?: AuthSession | null;
  readonly dialogBridge: DialogBridge;
  readonly meta: ChannelContractMeta;
  readonly recordActivity: (input: ActivityRecordInput) => Promise<void>;
}

export type RouteHandler = (
  args: unknown[],
  context: RequestContext,
) => Promise<unknown> | unknown;

export interface DispatchResult {
  readonly status: number;
  readonly body: unknown;
  readonly setCookie?: string;
}
