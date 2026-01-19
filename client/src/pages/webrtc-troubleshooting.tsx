/**
 * Enhanced WebRTC Connection Troubleshooting
 *
 * This provides network diagnostics and alternative connection configurations
 * to resolve corporate firewall/VPN issues blocking WebRTC connections.
 *
 * NOTE: Uses WebRTC-native testing methods (RTCPeerConnection) instead of WebSocket.
 */

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UnifiedSoftphone } from '@/components/softphone/UnifiedSoftphone';
import { TelnyxCredentials } from '@/lib/webrtc/telnyx-webrtc-client';
import { testWebRTCConnection, type WebRTCTestResult } from '@/lib/webrtc/webrtc-tester';
import { NetworkDiagnostics, type NetworkDiagnosticsResult } from '@/lib/webrtc/network-diagnostics';
import { useState, useEffect } from 'react';

type AlternativeTestResult = WebRTCTestResult & { config: number };

export default function WebRTCTroubleshootingPage() {
  const [credentials, setCredentials] = useState<TelnyxCredentials | null>(null);
  const [testResult, setTestResult] = useState<WebRTCTestResult | null>(null);
  const [networkDiagnostics, setNetworkDiagnostics] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [testingNetwork, setTestingNetwork] = useState(false);
  const [alternativeTests, setAlternativeTests] = useState<AlternativeTestResult[]>([]);

  // Load credentials on component mount
  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      const response = await fetch('/api/telnyx/webrtc/credentials');
      if (response.ok) {
        const data = await response.json();
        setCredentials(data);
      } else {
        console.error('Failed to fetch credentials');
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
    }
  };

  const runNetworkDiagnostics = async () => {
    setTestingNetwork(true);
    try {
      // Run WebRTC-based network diagnostics
      const diagnostics = await NetworkDiagnostics.diagnose();

      // Also test WebRTC capability (local peer connection)
      const webrtcCapability = await NetworkDiagnostics.testWebRTCCapability();

      setNetworkDiagnostics({
        ...diagnostics,
        webrtcCapability
      });

    } catch (error) {
      console.error('Network diagnostics failed:', error);
    } finally {
      setTestingNetwork(false);
    }
  };

  const runConnectionTest = async () => {
    if (!credentials) {
      alert('No credentials available');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setAlternativeTests([]);

    try {
      console.log('Testing standard configuration...');
      const result = await testWebRTCConnection(credentials);
      setTestResult(result);
      
      // If standard config failed, try alternatives
      if (!result.details.socketConnected) {
        console.log('Standard config failed, trying alternatives...');
        const alternativeConfigs = NetworkDiagnostics.getAlternativeConfigs();
        const altResults: AlternativeTestResult[] = [];
        
        for (let i = 0; i < alternativeConfigs.length; i++) {
          const config = alternativeConfigs[i];
          console.log(`Testing alternative config ${i + 1}:`, config);
          
          try {
            const altResult = await testWebRTCConnection(credentials, config);
            altResults.push({ config: i + 1, ...altResult });
            
            // If this config works, we can stop
            if (altResult.details.socketConnected && altResult.details.authenticated) {
              console.log(`Alternative config ${i + 1} successful!`);
              break;
            }
          } catch (error) {
            altResults.push({ 
              config: i + 1, 
              success: false,
              error: (error as Error).message,
              details: {
                sdkLoaded: false,
                socketConnected: false,
                authenticated: false,
                duration: 0
              }
            });
          }
        }
        
        setAlternativeTests(altResults);
      }
      
    } catch (error) {
      setTestResult({
        success: false,
        error: (error as Error).message,
        details: {
          sdkLoaded: false,
          socketConnected: false,
          authenticated: false,
          duration: 0
        }
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">WebRTC Connection Troubleshooting</h1>
      
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Connection Status</h2>
          
          <div className="space-y-4">
            <div>
              <span className="font-medium">SDK Status:</span> 
              <span className={`ml-2 ${typeof window !== 'undefined' && (window as any).TelnyxRTC ? 'text-green-600' : 'text-red-600'}`}>
                {typeof window !== 'undefined' && (window as any).TelnyxRTC ? 'available' : 'not loaded'}
              </span>
            </div>
            
            <div>
              <span className="font-medium">Credentials:</span> 
              <span className={`ml-2 ${credentials ? 'text-green-600' : 'text-red-600'}`}>
                {credentials ? '✅ Loaded' : '❌ Not loaded'}
              </span>
            </div>
            
            <div className="flex gap-4">
              <Button 
                onClick={runConnectionTest} 
                disabled={!credentials || testing}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {testing ? 'Testing Connection...' : 'Test WebRTC Connection'}
              </Button>
              
              <Button 
                onClick={runNetworkDiagnostics}
                disabled={testingNetwork}
                variant="outline"
              >
                {testingNetwork ? 'Testing Network...' : 'Run Network Diagnostics'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Network Diagnostics Results */}
        {networkDiagnostics && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-3">Network Diagnostics</h3>
            <div className="space-y-2 text-sm">
              <div><strong>Browser:</strong> {networkDiagnostics.userAgent}</div>
              <div><strong>Online:</strong> {networkDiagnostics.online ? '✅ Yes' : '❌ No'}</div>
              <div><strong>Connection Type:</strong> {networkDiagnostics.connection}</div>
              <div><strong>WebRTC Support:</strong> {networkDiagnostics.webrtcSupport ? '✅ Yes' : '❌ No'}</div>
              <div><strong>STUN Server Reachable:</strong> {networkDiagnostics.stunServerReachable ? '✅ Yes' : '❌ No'}</div>

              {networkDiagnostics.stunServers?.length > 0 && (
                <div>
                  <strong>Available STUN Servers:</strong>
                  <ul className="ml-4 mt-1">
                    {networkDiagnostics.stunServers.map((server: string, index: number) => (
                      <li key={index} className="text-xs">{server}</li>
                    ))}
                  </ul>
                </div>
              )}

              {networkDiagnostics.webrtcCapability && (
                <div>
                  <strong>WebRTC Peer Connection Test:</strong>
                  <span className="ml-2">
                    {networkDiagnostics.webrtcCapability.success
                      ? `✅ Success (${networkDiagnostics.webrtcCapability.latency}ms)`
                      : `❌ Failed - ${networkDiagnostics.webrtcCapability.error}`}
                  </span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Connection Test Results */}
        {testResult && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-3">Connection Test Results</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span>{testResult.details.sdkLoaded ? '✅' : '❌'}</span>
                <span>SDK Loaded: {testResult.details.sdkLoaded ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{testResult.details.socketConnected ? '✅' : '🔌'}</span>
                <span>Socket Connected: {testResult.details.socketConnected ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{testResult.details.authenticated ? '✅' : '🔐'}</span>
                <span>Authenticated: {testResult.details.authenticated ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>⏱️</span>
                <span>Duration: {testResult.details.duration}ms</span>
              </div>
              {testResult.error && (
                <div className="text-red-600 bg-red-50 p-3 rounded">
                  <strong>Error:</strong> {testResult.error}
                </div>
              )}
            </div>
            
            {/* Troubleshooting suggestions */}
            {!testResult.details.socketConnected && (
              <div className="mt-4 p-3 bg-yellow-50 rounded">
                <h4 className="font-medium text-yellow-800">Connection Failed - Troubleshooting Steps:</h4>
                <ul className="text-sm text-yellow-700 mt-2 space-y-1">
                  <li>• Corporate firewall/proxy may be blocking WebSocket connections</li>
                  <li>• VPN connections can interfere with WebRTC - try disabling temporarily</li>
                  <li>• Port 443 (WSS) or 80 (WS) may be restricted</li>
                  <li>• Network administrators may need to whitelist rtc.telnyx.com</li>
                  <li>• Try the Network Diagnostics above to identify specific blocking</li>
                </ul>
              </div>
            )}
          </Card>
        )}
        
        {/* Alternative Configuration Test Results */}
        {alternativeTests.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-3">Alternative Configuration Tests</h3>
            <p className="text-sm text-gray-600 mb-3">
              These tests try different network configurations to bypass firewall/VPN restrictions:
            </p>
            <div className="space-y-3">
              {alternativeTests.map((test, index) => (
                <div key={index} className={`border rounded p-3 ${test.details.socketConnected && test.details.authenticated ? 'border-green-500 bg-green-50' : ''}`}>
                  <h4 className="font-medium mb-2">Configuration {test.config}</h4>
                  <div className="text-sm space-y-1">
                    <div>{test.details.sdkLoaded ? '✅' : '❌'} SDK: {test.details.sdkLoaded ? 'Loaded' : 'Failed'}</div>
                    <div>{test.details.socketConnected ? '✅' : '🔌'} Socket: {test.details.socketConnected ? 'Connected' : 'Failed'}</div>
                    <div>{test.details.authenticated ? '✅' : '🔐'} Auth: {test.details.authenticated ? 'Success' : 'Failed'}</div>
                    {test.error && <div className="text-red-600">Error: {test.error}</div>}
                    {test.details.socketConnected && test.details.authenticated && (
                      <div className="text-green-600 font-medium">✅ This configuration works! You can use this setup.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Regular WebRTC Test Interface */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">WebRTC Calling Interface</h3>
          {credentials && (
            <UnifiedSoftphone
              telnyxCredentials={credentials}
              openaiEphemeralEndpoint=""
            />
          )}
        </Card>
      </div>
    </div>
  );
}

