import type { Express } from "express";
import { createServer, type Server } from "http";
import { state, addLogEntry, resetState } from "./storage";
import { connectSchema } from "@shared/schema";
import { log } from "./index";
import { CaptionHub } from "@captionhub/captionhub-node-sdk";

async function postWithBackoff(url: string, body: string, retries = 3): Promise<{ status: number | string; attempts: number }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body,
      });

      if (res.status >= 200 && res.status < 300) {
        return { status: res.status, attempts: attempt };
      }

      if (res.status >= 500 && attempt < retries) {
        const baseDelay = 100 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 100) - 50;
        const delay = Math.max(0, baseDelay + jitter);
        log(`Zoom returned ${res.status}, retry ${attempt + 1}/${retries} after ${delay}ms`, "zoom");
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return { status: res.status, attempts: attempt };
    } catch (err: any) {
      if (attempt < retries) {
        const baseDelay = 100 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 100) - 50;
        const delay = Math.max(0, baseDelay + jitter);
        log(`Network error, retry ${attempt + 1}/${retries} after ${delay}ms: ${err.message}`, "zoom");
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        log(`All ${retries} retries failed: ${err.message}`, "zoom");
        return { status: "failed", attempts: attempt };
      }
    }
  }
  return { status: "failed", attempts: retries };
}

const LANG_TO_ZOOM: Record<string, string> = {
  "EN": "en-US", "ES": "es-ES", "FR": "fr-FR", "DE": "de-DE", "IT": "it-IT",
  "PT": "pt-PT", "NL": "nl-NL", "PL": "pl-PL", "RU": "ru-RU", "JA": "ja-JP",
  "KO": "ko-KR", "ZH": "zh-CN", "AR": "ar-SA", "HI": "hi-IN", "TR": "tr-TR",
  "SV": "sv-SE", "DA": "da-DK", "NO": "no-NO", "FI": "fi-FI", "CS": "cs-CZ",
  "HU": "hu-HU", "RO": "ro-RO", "UK": "uk-UA", "HE": "he-IL", "TH": "th-TH",
  "VI": "vi-VN", "ID": "id-ID", "MS": "ms-MY",
};

function forwardToZoom(text: string, captionLang?: string) {
  state.seqCounter++;
  const zoomLang = captionLang ? (LANG_TO_ZOOM[captionLang.toUpperCase()] || "en-US") : "en-US";
  const separator = state.zoomToken.includes("?") ? "&" : "?";
  const url = `${state.zoomToken}${separator}seq=${state.seqCounter}&lang=${zoomLang}`;

  log(`Forwarding caption (seq=${state.seqCounter}): "${text.substring(0, 80)}..."`, "zoom");

  postWithBackoff(url, text).then(({ status, attempts }) => {
    addLogEntry({
      timestamp: new Date().toISOString(),
      text,
      status,
      retries: attempts,
    });
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/config", (_req, res) => {
    return res.json({
      hasCaptionHubKey: !!process.env.CAPTIONHUB_API_KEY,
    });
  });

  app.post("/api/connect", async (req, res) => {
    try {
      const { flowId, zoomToken, captionHubToken, language } = req.body;

      const resolvedToken = captionHubToken || process.env.CAPTIONHUB_API_KEY;
      if (!resolvedToken) {
        return res.status(400).json({ message: "CaptionHub API token is required" });
      }
      if (!flowId) {
        return res.status(400).json({ message: "CaptionHub Flow ID is required" });
      }
      if (!zoomToken || !zoomToken.includes("closedcaption") || !zoomToken.includes("id=")) {
        return res.status(400).json({ message: "Valid Zoom closedcaption URL is required (must contain 'closedcaption' and 'id=')" });
      }

      if (state.timbraConnection) {
        state.timbraConnection.disconnect();
        state.timbraConnection = null;
      }

      const selectedLanguage = (language || "").toUpperCase();

      state.captionHubToken = resolvedToken;
      state.flowId = flowId;
      state.zoomToken = zoomToken;
      state.language = selectedLanguage;
      state.connectionStatus = "connecting";
      state.seqCounter = 0;

      log(`Subscribing to CaptionHub flow ${flowId} via SDK${selectedLanguage ? ` (language: ${selectedLanguage})` : " (all languages)"}`, "captionhub");

      try {
        const captionhub = new CaptionHub(resolvedToken);

        const connection = await captionhub.timbra.subscribe({
          flowId,
          onCaption: (event) => {
            log(`Received ${event.captions.length} caption(s)`, "captionhub");
            for (const caption of event.captions) {
              if (!caption.text) continue;
              if (state.language && caption.language.toUpperCase() !== state.language) {
                log(`Skipping caption in ${caption.language} (filtering for ${state.language})`, "captionhub");
                continue;
              }
              forwardToZoom(caption.text, caption.language);
            }
          },
          onHeartbeat: (event) => {
            log(`Heartbeat: ${event.timestamp}`, "captionhub");
          },
        });

        state.timbraConnection = connection;
        state.connectionStatus = "connected";

        log("Successfully subscribed to CaptionHub flow", "captionhub");
        return res.json({ message: "Connected successfully" });
      } catch (err: any) {
        state.connectionStatus = "error";
        const message = err.message || "Failed to connect to CaptionHub";
        log(`Connection error: ${message}`, "captionhub");
        return res.status(500).json({ message });
      }
    } catch (err: any) {
      state.connectionStatus = "error";
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/disconnect", (_req, res) => {
    if (state.timbraConnection) {
      state.timbraConnection.disconnect();
      log("Disconnected from CaptionHub", "captionhub");
    }
    resetState();
    return res.json({ message: "Disconnected" });
  });

  app.get("/api/status", (_req, res) => {
    return res.json({
      connectionStatus: state.connectionStatus,
      lastCaptionAt: state.lastCaptionAt,
      recentLog: state.log,
      language: state.language,
    });
  });

  return httpServer;
}
