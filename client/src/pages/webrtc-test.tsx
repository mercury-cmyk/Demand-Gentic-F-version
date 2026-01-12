import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedSoftphone } from "@/components/softphone/UnifiedSoftphone";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";

export default function WebRTCTestPage() {
  const [sdkStatus, setSdkStatus] = useState<string>('checking');

  // Check SDK availability
  useEffect(() => {
    const checkSDK = async () => {
      try {
        const { TelnyxRTC } = await import('@telnyx/webrtc');
        if (typeof TelnyxRTC === 'function') {
          setSdkStatus('available');
          console.log('[WebRTC-Test] Telnyx SDK loaded successfully');
        } else {
          setSdkStatus('error: SDK loaded but TelnyxRTC is not a function');
        }
      } catch (error) {
        setSdkStatus(`error: ${(error as Error).message}`);
        console.error('[WebRTC-Test] SDK load error:', error);
      }
    };
    checkSDK();
  }, []);

  const { data: credentials, isLoading, error } = useQuery({
    queryKey: ["/api/telnyx/webrtc/credentials"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/telnyx/webrtc/credentials");
      return res.json() as Promise<{ username: string; password: string; callerIdNumber?: string }>;
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle>Loading WebRTC credentials...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="container mx-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle>Error loading credentials</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">
              {error ? String(error) : "Failed to fetch credentials. Check browser console."}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Make sure you're logged in and the server is running.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  console.log('[WebRTC-Test] Loaded credentials:', { username: credentials.username, hasPassword: !!credentials.password, callerIdNumber: credentials.callerIdNumber });

  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle>Unified WebRTC Calling Test</CardTitle>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>SDK Status: <span className={sdkStatus === 'available' ? 'text-green-600' : 'text-red-600'}>{sdkStatus}</span></div>
            <div>Credentials: {credentials ? '✅ Loaded' : '❌ Not loaded'}</div>
          </div>
        </CardHeader>
        <CardContent>
          <UnifiedSoftphone
            telnyxCredentials={{
              username: credentials.username,
              password: credentials.password,
            }}
            callerIdNumber={credentials.callerIdNumber || "+13023601514"}
            openaiEphemeralEndpoint="/api/openai/webrtc/ephemeral-token"
            openaiVoice="alloy"
            showModeToggle={true}
            showTranscripts={true}
            onCallStart={(num) => console.log("Call started to:", num)}
            onCallEnd={() => console.log("Call ended")}
            onModeChange={(mode) => console.log("Mode changed to:", mode)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
