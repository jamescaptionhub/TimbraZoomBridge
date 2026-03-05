import { z } from "zod";

export const CAPTION_LANGUAGES = [
  { value: "", label: "All Languages" },
  { value: "EN", label: "English" },
  { value: "ES", label: "Spanish" },
  { value: "FR", label: "French" },
  { value: "DE", label: "German" },
  { value: "IT", label: "Italian" },
  { value: "PT", label: "Portuguese" },
  { value: "NL", label: "Dutch" },
  { value: "PL", label: "Polish" },
  { value: "RU", label: "Russian" },
  { value: "JA", label: "Japanese" },
  { value: "KO", label: "Korean" },
  { value: "ZH", label: "Chinese" },
  { value: "AR", label: "Arabic" },
  { value: "HI", label: "Hindi" },
  { value: "TR", label: "Turkish" },
  { value: "SV", label: "Swedish" },
  { value: "DA", label: "Danish" },
  { value: "NO", label: "Norwegian" },
  { value: "FI", label: "Finnish" },
  { value: "CS", label: "Czech" },
  { value: "HU", label: "Hungarian" },
  { value: "RO", label: "Romanian" },
  { value: "UK", label: "Ukrainian" },
  { value: "HE", label: "Hebrew" },
  { value: "TH", label: "Thai" },
  { value: "VI", label: "Vietnamese" },
  { value: "ID", label: "Indonesian" },
  { value: "MS", label: "Malay" },
] as const;

export const connectSchema = z.object({
  captionHubToken: z.string().optional().default(""),
  flowId: z.string().min(1, "CaptionHub Flow ID is required"),
  zoomToken: z.string().min(1, "Zoom API token is required")
    .refine(val => val.includes("closedcaption") && val.includes("id="), {
      message: "Zoom token must be a valid closedcaption URL containing 'closedcaption' and 'id='"
    }),
  language: z.string().optional().default(""),
});

export type ConnectRequest = z.infer<typeof connectSchema>;

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface LogEntry {
  timestamp: string;
  text: string;
  status: number | string;
  retries: number;
  language?: string;
}

export interface StatusResponse {
  connectionStatus: ConnectionStatus;
  lastCaptionAt: string | null;
  recentLog: LogEntry[];
  language: string;
}

export interface ConfigResponse {
  hasCaptionHubKey: boolean;
}
