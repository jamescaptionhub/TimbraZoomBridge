import { z } from "zod";

export const connectSchema = z.object({
  captionHubToken: z.string().optional().default(""),
  flowId: z.string().min(1, "CaptionHub Flow ID is required"),
  zoomToken: z.string().min(1, "Zoom API token is required")
    .refine(val => val.includes("closedcaption") && val.includes("id="), {
      message: "Zoom token must be a valid closedcaption URL containing 'closedcaption' and 'id='"
    }),
});

export type ConnectRequest = z.infer<typeof connectSchema>;

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface LogEntry {
  timestamp: string;
  text: string;
  status: number | string;
  retries: number;
}

export interface StatusResponse {
  connectionStatus: ConnectionStatus;
  lastCaptionAt: string | null;
  recentLog: LogEntry[];
}

export interface ConfigResponse {
  hasCaptionHubKey: boolean;
}
