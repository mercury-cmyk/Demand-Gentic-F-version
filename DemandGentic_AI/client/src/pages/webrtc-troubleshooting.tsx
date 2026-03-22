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
  const [credentials, setCredentials] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [networkDiagnostics, setNetworkDiagnostics] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testingNetwork, setTestingNetwork] = useState(false);
  const [alternativeTests, setAlternativeTests] = useState([]);

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
        
        for (let i = 0; i 
      WebRTC Connection Troubleshooting
      
      
        
          Connection Status
          
          
            
              SDK Status: 
              
                {typeof window !== 'undefined' && (window as any).TelnyxRTC ? 'available' : 'not loaded'}
              
            
            
            
              Credentials: 
              
                {credentials ? '✅ Loaded' : '❌ Not loaded'}
              
            
            
            
              
                {testing ? 'Testing Connection...' : 'Test WebRTC Connection'}
              
              
              
                {testingNetwork ? 'Testing Network...' : 'Run Network Diagnostics'}
              
            
          
        

        {/* Network Diagnostics Results */}
        {networkDiagnostics && (
          
            Network Diagnostics
            
              Browser: {networkDiagnostics.userAgent}
              Online: {networkDiagnostics.online ? '✅ Yes' : '❌ No'}
              Connection Type: {networkDiagnostics.connection}
              WebRTC Support: {networkDiagnostics.webrtcSupport ? '✅ Yes' : '❌ No'}
              STUN Server Reachable: {networkDiagnostics.stunServerReachable ? '✅ Yes' : '❌ No'}

              {networkDiagnostics.stunServers?.length > 0 && (
                
                  Available STUN Servers:
                  
                    {networkDiagnostics.stunServers.map((server: string, index: number) => (
                      {server}
                    ))}
                  
                
              )}

              {networkDiagnostics.webrtcCapability && (
                
                  WebRTC Peer Connection Test:
                  
                    {networkDiagnostics.webrtcCapability.success
                      ? `✅ Success (${networkDiagnostics.webrtcCapability.latency}ms)`
                      : `❌ Failed - ${networkDiagnostics.webrtcCapability.error}`}
                  
                
              )}
            
          
        )}

        {/* Connection Test Results */}
        {testResult && (
          
            Connection Test Results
            
              
                {testResult.details.sdkLoaded ? '✅' : '❌'}
                SDK Loaded: {testResult.details.sdkLoaded ? 'Yes' : 'No'}
              
              
                {testResult.details.socketConnected ? '✅' : '🔌'}
                Socket Connected: {testResult.details.socketConnected ? 'Yes' : 'No'}
              
              
                {testResult.details.authenticated ? '✅' : '🔐'}
                Authenticated: {testResult.details.authenticated ? 'Yes' : 'No'}
              
              
                ⏱️
                Duration: {testResult.details.duration}ms
              
              {testResult.error && (
                
                  Error: {testResult.error}
                
              )}
            
            
            {/* Troubleshooting suggestions */}
            {!testResult.details.socketConnected && (
              
                Connection Failed - Troubleshooting Steps:
                
                  • Corporate firewall/proxy may be blocking WebSocket connections
                  • VPN connections can interfere with WebRTC - try disabling temporarily
                  • Port 443 (WSS) or 80 (WS) may be restricted
                  • Network administrators may need to whitelist rtc.telnyx.com
                  • Try the Network Diagnostics above to identify specific blocking
                
              
            )}
          
        )}
        
        {/* Alternative Configuration Test Results */}
        {alternativeTests.length > 0 && (
          
            Alternative Configuration Tests
            
              These tests try different network configurations to bypass firewall/VPN restrictions:
            
            
              {alternativeTests.map((test, index) => (
                
                  Configuration {test.config}
                  
                    {test.details.sdkLoaded ? '✅' : '❌'} SDK: {test.details.sdkLoaded ? 'Loaded' : 'Failed'}
                    {test.details.socketConnected ? '✅' : '🔌'} Socket: {test.details.socketConnected ? 'Connected' : 'Failed'}
                    {test.details.authenticated ? '✅' : '🔐'} Auth: {test.details.authenticated ? 'Success' : 'Failed'}
                    {test.error && Error: {test.error}}
                    {test.details.socketConnected && test.details.authenticated && (
                      ✅ This configuration works! You can use this setup.
                    )}
                  
                
              ))}
            
          
        )}

        {/* Regular WebRTC Test Interface */}
        
          WebRTC Calling Interface
          {credentials && (
            
          )}
        
      
    
  );
}