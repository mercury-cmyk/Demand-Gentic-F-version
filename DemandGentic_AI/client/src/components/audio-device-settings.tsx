import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Mic, Volume2, Settings, Globe, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

interface AudioDeviceSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDevicesSelected?: (micId: string | null, speakerId: string | null) => void;
  onNetworkModeChanged?: (restrictiveMode: boolean) => void;
  initialRestrictiveMode?: boolean;
}

export function AudioDeviceSettings({ open, onOpenChange, onDevicesSelected, onNetworkModeChanged, initialRestrictiveMode = false }: AudioDeviceSettingsProps) {
  const [microphones, setMicrophones] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [restrictiveNetworkMode, setRestrictiveNetworkMode] = useState(initialRestrictiveMode);
  const { toast } = useToast();

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedMic = localStorage.getItem('telnyx_microphone_id');
    const savedSpeaker = localStorage.getItem('telnyx_speaker_id');
    const savedNetworkMode = localStorage.getItem('telnyx_restrictive_network_mode');
    
    if (savedMic) setSelectedMic(savedMic);
    if (savedSpeaker) setSelectedSpeaker(savedSpeaker);
    if (savedNetworkMode === 'true') setRestrictiveNetworkMode(true);
  }, []);

  // Request microphone permission and enumerate devices
  const requestPermissionAndEnumerate = async () => {
    try {
      // Request mic permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop all tracks (we just needed permission)
      stream.getTracks().forEach(track => track.stop());
      
      setPermissionGranted(true);
      
      // Now enumerate all devices
      await enumerateDevices();
      
      toast({
        description: "Microphone access granted",
      });
    } catch (error) {
      console.error('Error requesting audio permission:', error);
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: "Please allow microphone access to configure audio devices",
      });
    }
  };

  // Enumerate available audio devices
  const enumerateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const mics: AudioDevice[] = [];
      const spkrs: AudioDevice[] = [];
      
      devices.forEach(device => {
        if (device.kind === 'audioinput') {
          mics.push({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${mics.length + 1}`,
            kind: 'audioinput'
          });
        } else if (device.kind === 'audiooutput') {
          spkrs.push({
            deviceId: device.deviceId,
            label: device.label || `Speaker ${spkrs.length + 1}`,
            kind: 'audiooutput'
          });
        }
      });
      
      setMicrophones(mics);
      setSpeakers(spkrs);
      
      // Auto-select first device if none selected
      if (!selectedMic && mics.length > 0) {
        setSelectedMic(mics[0].deviceId);
      }
      if (!selectedSpeaker && spkrs.length > 0) {
        setSelectedSpeaker(spkrs[0].deviceId);
      }
    } catch (error) {
      console.error('Error enumerating devices:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load audio devices",
      });
    }
  };

  // Load devices when dialog opens
  useEffect(() => {
    if (open) {
      // Check if we already have permission
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then(result => {
          if (result.state === 'granted') {
            setPermissionGranted(true);
            enumerateDevices();
          }
        })
        .catch(() => {
          // Permissions API might not be available, try enumerating anyway
          enumerateDevices().then(() => {
            // If we got device labels, permission was granted
            setPermissionGranted(true);
          });
        });
    }
  }, [open]);

  // Save device selections
  const handleSave = () => {
    // Save to localStorage
    if (selectedMic) {
      localStorage.setItem('telnyx_microphone_id', selectedMic);
    }
    if (selectedSpeaker) {
      localStorage.setItem('telnyx_speaker_id', selectedSpeaker);
    }
    
    // Save network mode
    localStorage.setItem('telnyx_restrictive_network_mode', String(restrictiveNetworkMode));
    
    // Notify parent component
    onDevicesSelected?.(selectedMic || null, selectedSpeaker || null);
    onNetworkModeChanged?.(restrictiveNetworkMode);
    
    toast({
      description: restrictiveNetworkMode 
        ? "Settings saved. Restrictive network mode enabled - page will reload."
        : "Audio device settings saved",
    });
    
    onOpenChange(false);
    
    // If network mode changed, need to reload to reinitialize WebRTC
    if (restrictiveNetworkMode !== initialRestrictiveMode) {
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  // Test microphone (show volume indicator)
  const testMicrophone = async () => {
    if (!selectedMic) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: selectedMic } }
      });
      
      toast({
        description: "Microphone test successful! Speak to see if it's working.",
      });
      
      // Stop stream after 3 seconds
      setTimeout(() => {
        stream.getTracks().forEach(track => track.stop());
      }, 3000);
    } catch (error) {
      console.error('Microphone test failed:', error);
      toast({
        variant: "destructive",
        title: "Test Failed",
        description: "Could not access selected microphone",
      });
    }
  };

  return (
    
      
        
          
            
            Audio Device Settings
          
          
            Configure your microphone and speaker for calls
          
        

        
          {!permissionGranted && (
            
              
                Microphone access is required to configure audio devices.
              
              
                
                Grant Microphone Access
              
            
          )}

          {permissionGranted && (
            <>
              {/* Microphone Selection */}
              
                
                  
                  Microphone
                
                
                  
                    
                  
                  
                    {microphones.map(mic => (
                      
                        {mic.label}
                      
                    ))}
                    {microphones.length === 0 && (
                      
                        No microphones found
                      
                    )}
                  
                
                {selectedMic && (
                  
                    Test Microphone
                  
                )}
              

              {/* Speaker Selection */}
              
                
                  
                  Speaker / Headphones
                
                
                  
                    
                  
                  
                    {speakers.map(speaker => (
                      
                        {speaker.label}
                      
                    ))}
                    {speakers.length === 0 && (
                      
                        No speakers found
                      
                    )}
                  
                
              

              {/* Restrictive Network Mode - for Pakistan, China, etc. */}
              
                
                  
                    
                    Restrictive Network Mode
                  
                  
                
                
                  Enable this if you're in Pakistan, China, or other countries where VoIP is blocked.
                  This routes all voice traffic through secure relay servers on port 443 (HTTPS).
                
                {restrictiveNetworkMode && (
                  
                    
                    
                      Page will reload to apply network changes. Connection may take longer (~90 seconds).
                    
                  
                )}
              

              
                 onOpenChange(false)}
                  data-testid="button-cancel-audio-settings"
                >
                  Cancel
                
                
                  Save Settings
                
              
            
          )}
        
      
    
  );
}