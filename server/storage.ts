import type { ConnectionStatus, LogEntry } from "@shared/schema";

export interface AppState {
  captionHubToken: string;
  flowId: string;
  zoomToken: string;
  language: string;
  timbraConnection: any | null;
  connectionStatus: ConnectionStatus;
  log: LogEntry[];
  seqCounter: number;
  lastCaptionAt: string | null;
}

export const state: AppState = {
  captionHubToken: "",
  flowId: "",
  zoomToken: "",
  language: "",
  timbraConnection: null,
  connectionStatus: "disconnected",
  log: [],
  seqCounter: 0,
  lastCaptionAt: null,
};

export function addLogEntry(entry: LogEntry) {
  state.log.unshift(entry);
  if (state.log.length > 20) {
    state.log = state.log.slice(0, 20);
  }
  state.lastCaptionAt = entry.timestamp;
}

export function resetState() {
  state.captionHubToken = "";
  state.flowId = "";
  state.zoomToken = "";
  state.language = "";
  state.timbraConnection = null;
  state.connectionStatus = "disconnected";
  state.log = [];
  state.seqCounter = 0;
  state.lastCaptionAt = null;
}
