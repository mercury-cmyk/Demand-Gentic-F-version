import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UnifiedSoftphone } from "@/components/softphone/UnifiedSoftphone";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { testWebRTCConnection, type WebRTCTestResult } from "@/lib/webrtc/webrtc-tester";

export default function WebRTCTestPage() {
  const [sdkStatus, setSdkStatus] = useState<string>('checking');
  const [testResult, setTestResult] = useState<WebRTCTestResult | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

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

  const runConnectionTest = async () => {
    if (!credentials) return;
    
    setIsTestingConnection(true);
    setTestResult(null);
    
    try {
      const result = await testWebRTCConnection({
        username: credentials.username,
        password: credentials.password
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
        details: {
          sdkLoaded: false,
          socketConnected: false,
          authenticated: false,
          duration: 0
        }
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle>Unified WebRTC Calling Test</CardTitle>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>SDK Status: <span className={sdkStatus === 'available' ? 'text-green-600' : 'text-red-600'}>{sdkStatus}</span></div>
            <div>Credentials: {credentials ? '✅ Loaded' : '❌ Not loaded'}</div>
            {credentials && (
              <div className="pt-2">
                <Button 
                  onClick={runConnectionTest}
                  disabled={isTestingConnection}
                  variant="outline"
                  size="sm"
                >
                  {isTestingConnection ? 'Testing Connection...' : 'Test WebRTC Connection'}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Connection Test Results */}
          {testResult && (
            <div className={`mb-6 p-4 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <h3 className="font-semibold mb-2">Connection Test Results</h3>
              <div className="space-y-2 text-sm">
                <div>✅ SDK Loaded: {testResult.details.sdkLoaded ? 'Yes' : 'No'}</div>
                <div>🔌 Socket Connected: {testResult.details.socketConnected ? 'Yes' : 'No'}</div>
                <div>🔐 Authenticated: {testResult.details.authenticated ? 'Yes' : 'No'}</div>
                <div>⏱️ Duration: {testResult.details.duration}ms</div>
                {testResult.error && (
                  <div className="text-red-600 font-medium">Error: {testResult.error}</div>
                )}
                {testResult.success && (
                  <div className="text-green-600 font-medium">✅ Connection successful!</div>
                )}
              </div>
            </div>
          )}
          
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
