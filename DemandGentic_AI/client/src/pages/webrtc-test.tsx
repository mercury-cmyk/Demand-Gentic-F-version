import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UnifiedSoftphone } from "@/components/softphone/UnifiedSoftphone";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { testWebRTCConnection, type WebRTCTestResult } from "@/lib/webrtc/webrtc-tester";

export default function WebRTCTestPage() {
  const [sdkStatus, setSdkStatus] = useState('checking');
  const [testResult, setTestResult] = useState(null);
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
      return res.json() as Promise;
    },
  });

  if (isLoading) {
    return (
      
        
          
            Loading WebRTC credentials...
          
        
      
    );
  }

  if (!credentials) {
    return (
      
        
          
            Error loading credentials
          
          
            
              {error ? String(error) : "Failed to fetch credentials. Check browser console."}
            
            
              Make sure you're logged in and the server is running.
            
          
        
      
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
    
      
        
          Unified WebRTC Calling Test
          
            SDK Status: {sdkStatus}
            Credentials: {credentials ? '✅ Loaded' : '❌ Not loaded'}
            {credentials && (
              
                
                  {isTestingConnection ? 'Testing Connection...' : 'Test WebRTC Connection'}
                
              
            )}
          
        
        
          {/* Connection Test Results */}
          {testResult && (
            
              Connection Test Results
              
                ✅ SDK Loaded: {testResult.details.sdkLoaded ? 'Yes' : 'No'}
                🔌 Socket Connected: {testResult.details.socketConnected ? 'Yes' : 'No'}
                🔐 Authenticated: {testResult.details.authenticated ? 'Yes' : 'No'}
                ⏱️ Duration: {testResult.details.duration}ms
                {testResult.error && (
                  Error: {testResult.error}
                )}
                {testResult.success && (
                  ✅ Connection successful!
                )}
              
            
          )}
          
           console.log("Call started to:", num)}
            onCallEnd={() => console.log("Call ended")}
            onModeChange={(mode) => console.log("Mode changed to:", mode)}
          />
        
      
    
  );
}