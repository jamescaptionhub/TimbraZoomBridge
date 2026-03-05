import type { Express } from "express";
import { createServer, type Server } from "http";
import { state, addLogEntry, resetState } from "./storage";
import { connectSchema } from "@shared/schema";
import { log } from "./index";
import Pusher from "pusher-js";

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

function forwardToZoom(text: string) {
  state.seqCounter++;
  const separator = state.zoomToken.includes("?") ? "&" : "?";
  const url = `${state.zoomToken}${separator}seq=${state.seqCounter}&lang=en-US`;

  log(`Forwarding caption (seq=${state.seqCounter}): "${text.substring(0, 60)}..."`, "zoom");

  postWithBackoff(url, text).then(({ status, attempts }) => {
    addLogEntry({
      timestamp: new Date().toISOString(),
      text,
      status,
      retries: attempts,
    });
  });
}

function extractCaptionText(data: any): string | null {
  if (typeof data === "string") return data;
  if (typeof data !== "object" || data === null) return null;

  if (data.text) return String(data.text);
  if (data.caption) return String(data.caption);
  if (data.body) return String(data.body);
  if (data.content) return String(data.content);
  if (data.message) return String(data.message);
  if (data.data && typeof data.data === "string") return data.data;
  if (data.data && typeof data.data === "object") return extractCaptionText(data.data);

  const values = Object.values(data);
  for (const val of values) {
    if (typeof val === "string" && val.length > 0) return val;
  }

  return JSON.stringify(data);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/connect", async (req, res) => {
    try {
      const parsed = connectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors.map(e => e.message).join(", ")
        });
      }

      const { captionHubToken, flowId, zoomToken } = parsed.data;

      if (state.pusherClient) {
        state.pusherClient.disconnect();
        state.pusherClient = null;
      }

      state.captionHubToken = captionHubToken;
      state.flowId = flowId;
      state.zoomToken = zoomToken;
      state.connectionStatus = "connecting";
      state.seqCounter = 0;

      log(`Fetching Pusher connection details for flow ${flowId}`, "captionhub");

      let pusherKey: string, channelName: string, cluster: string;

      try {
        const apiRes = await fetch(
          `https://api.captionhub.com/api/v1/timbra/${flowId}/connection`,
          {
            headers: { Authorization: captionHubToken },
          }
        );

        if (!apiRes.ok) {
          const errText = await apiRes.text();
          state.connectionStatus = "error";
          return res.status(apiRes.status).json({
            message: `CaptionHub API error (${apiRes.status}): ${errText}`
          });
        }

        const connectionData = await apiRes.json() as any;
        pusherKey = connectionData.pusher?.key;
        channelName = connectionData.pusher?.channel_name;
        cluster = connectionData.pusher?.cluster;

        if (!pusherKey || !channelName || !cluster) {
          state.connectionStatus = "error";
          return res.status(500).json({
            message: "Missing Pusher connection details from CaptionHub response"
          });
        }

        log(`Pusher details: key=${pusherKey}, channel=${channelName}, cluster=${cluster}`, "captionhub");
      } catch (err: any) {
        state.connectionStatus = "error";
        return res.status(500).json({
          message: `Failed to connect to CaptionHub API: ${err.message}`
        });
      }

      try {
        const pusherClient = new Pusher(pusherKey, {
          cluster,
          enabledTransports: ["ws"],
        });

        const channel = pusherClient.subscribe(channelName);

        channel.bind_global((eventName: string, data: any) => {
          if (eventName.startsWith("pusher:")) return;

          log(`Received event: ${eventName}`, "pusher");
          const text = extractCaptionText(data);
          if (text) {
            forwardToZoom(text);
          }
        });

        pusherClient.connection.bind("connected", () => {
          log("Pusher connected", "pusher");
          state.connectionStatus = "connected";
        });

        pusherClient.connection.bind("disconnected", () => {
          log("Pusher disconnected", "pusher");
        });

        pusherClient.connection.bind("error", (err: any) => {
          log(`Pusher error: ${JSON.stringify(err)}`, "pusher");
          state.connectionStatus = "error";
        });

        state.pusherClient = pusherClient;

        return res.json({ message: "Connection initiated" });
      } catch (err: any) {
        state.connectionStatus = "error";
        return res.status(500).json({
          message: `Failed to initialize Pusher: ${err.message}`
        });
      }
    } catch (err: any) {
      state.connectionStatus = "error";
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/disconnect", (_req, res) => {
    if (state.pusherClient) {
      state.pusherClient.disconnect();
      log("Disconnected from Pusher", "pusher");
    }
    resetState();
    return res.json({ message: "Disconnected" });
  });

  app.get("/api/status", (_req, res) => {
    return res.json({
      connectionStatus: state.connectionStatus,
      lastCaptionAt: state.lastCaptionAt,
      recentLog: state.log,
    });
  });

  return httpServer;
}
