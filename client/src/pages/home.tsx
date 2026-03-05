import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { connectSchema, type ConnectRequest, type StatusResponse, type ConfigResponse, type LogEntry } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  Captions,
  Clock,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  KeyRound,
} from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  disconnected: { label: "Disconnected", color: "bg-muted text-muted-foreground", icon: WifiOff },
  connecting: { label: "Connecting...", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Loader2 },
  connected: { label: "Connected", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: Wifi },
  error: { label: "Error", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle },
};

function StatusIndicator({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
  const Icon = config.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium ${config.color}`} data-testid="status-indicator">
      <Icon className={`w-4 h-4 ${status === "connecting" ? "animate-spin" : ""}`} />
      {config.label}
    </div>
  );
}

function LogPanel({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="text-empty-log">
        <Captions className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No captions yet</p>
        <p className="text-xs mt-1">Captions will appear here once the connection is active</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 pr-3">
        {entries.map((entry, i) => {
          const isSuccess = typeof entry.status === "number" && entry.status >= 200 && entry.status < 300;
          const isFailed = entry.status === "failed";
          return (
            <div
              key={`${entry.timestamp}-${i}`}
              className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border border-transparent"
              data-testid={`log-entry-${i}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {isSuccess ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : isFailed ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed break-words" data-testid={`text-caption-${i}`}>
                  {entry.text}
                </p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge variant="secondary" className="text-xs no-default-active-elevate">
                    {typeof entry.status === "number" ? `HTTP ${entry.status}` : entry.status}
                  </Badge>
                  {entry.retries > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {entry.retries} {entry.retries === 1 ? "retry" : "retries"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [isFormVisible, setIsFormVisible] = useState(true);

  const { data: configData } = useQuery<ConfigResponse>({
    queryKey: ["/api/config"],
  });

  const hasCaptionHubKey = configData?.hasCaptionHubKey ?? false;

  const form = useForm<ConnectRequest>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      captionHubToken: "",
      flowId: "",
      zoomToken: "",
    },
  });

  const { data: statusData } = useQuery<StatusResponse>({
    queryKey: ["/api/status"],
    refetchInterval: 3000,
    staleTime: 0,
  });

  const connectionStatus = statusData?.connectionStatus || "disconnected";
  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  const connectMutation = useMutation({
    mutationFn: async (data: ConnectRequest) => {
      const payload: any = { flowId: data.flowId, zoomToken: data.zoomToken };
      if (data.captionHubToken) {
        payload.captionHubToken = data.captionHubToken;
      }
      const res = await apiRequest("POST", "/api/connect", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      toast({ title: "Connecting", description: "Establishing connection to CaptionHub..." });
      setIsFormVisible(false);
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      toast({ title: "Disconnected", description: "Caption forwarding stopped" });
      setIsFormVisible(true);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function onSubmit(data: ConnectRequest) {
    connectMutation.mutate(data);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-md bg-primary/10">
              <Captions className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-title">
              Caption Bridge
            </h1>
          </div>
          <p className="text-muted-foreground text-sm ml-[52px]">
            Forward CaptionHub captions to Zoom closed captioning in real time
          </p>
        </header>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <CardTitle className="text-base font-medium">Connection</CardTitle>
              <StatusIndicator status={connectionStatus} />
            </CardHeader>
            <CardContent>
              {isFormVisible && !isConnected ? (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {hasCaptionHubKey ? (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 text-sm" data-testid="text-api-key-stored">
                        <KeyRound className="w-4 h-4 flex-shrink-0" />
                        <span>CaptionHub API key is configured on the server</span>
                      </div>
                    ) : (
                      <FormField
                        control={form.control}
                        name="captionHubToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CaptionHub API Token</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Enter your CaptionHub API token"
                                data-testid="input-captionhub-token"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="flowId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CaptionHub Flow ID</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. 8ccea7c864e5"
                              data-testid="input-flow-id"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="zoomToken"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zoom Caption API URL</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://wmcc.zoom.us/closedcaption?id=..."
                              data-testid="input-zoom-token"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      The Zoom caption URL is session-scoped. You need a fresh URL at the start of each Zoom meeting.
                    </p>
                    <div className="flex gap-3 pt-2">
                      <Button
                        type="submit"
                        disabled={connectMutation.isPending || isConnecting}
                        data-testid="button-connect"
                      >
                        {connectMutation.isPending || isConnecting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            Connect
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {isConnected
                        ? "Captions are being forwarded to Zoom."
                        : connectionStatus === "error"
                        ? "An error occurred. Try reconnecting."
                        : "Processing..."}
                    </p>
                    <div className="flex gap-2">
                      {!isFormVisible && !isConnected && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsFormVisible(true)}
                          data-testid="button-show-form"
                        >
                          Reconnect
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => disconnectMutation.mutate()}
                        disabled={disconnectMutation.isPending}
                        data-testid="button-disconnect"
                      >
                        {disconnectMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <WifiOff className="w-4 h-4 mr-2" />
                            Disconnect
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  {statusData?.lastCaptionAt && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last caption: {new Date(statusData.lastCaptionAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-medium">Caption Log</CardTitle>
                {statusData?.recentLog && statusData.recentLog.length > 0 && (
                  <Badge variant="secondary" className="no-default-active-elevate">
                    {statusData.recentLog.length} {statusData.recentLog.length === 1 ? "entry" : "entries"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <LogPanel entries={statusData?.recentLog || []} />
            </CardContent>
          </Card>
        </div>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          CaptionHub to Zoom Bridge — Internal Operations Tool
        </footer>
      </div>
    </div>
  );
}
