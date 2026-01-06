import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Volume2, Settings } from "lucide-react";
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
}

export function AudioDeviceSettings({ open, onOpenChange, onDevicesSelected }: AudioDeviceSettingsProps) {
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [speakers, setSpeakers] = useState<AudioDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");
  const [permissionGranted, setPermissionGranted] = useState(false);
  const { toast } = useToast();

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedMic = localStorage.getItem('telnyx_microphone_id');
    const savedSpeaker = localStorage.getItem('telnyx_speaker_id');
    
    if (savedMic) setSelectedMic(savedMic);
    if (savedSpeaker) setSelectedSpeaker(savedSpeaker);
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
    
    // Notify parent component
    onDevicesSelected?.(selectedMic || null, selectedSpeaker || null);
    
    toast({
      description: "Audio device settings saved",
    });
    
    onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-audio-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Audio Device Settings
          </DialogTitle>
          <DialogDescription>
            Configure your microphone and speaker for calls
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!permissionGranted && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">
                Microphone access is required to configure audio devices.
              </p>
              <Button 
                onClick={requestPermissionAndEnumerate}
                className="w-full"
                data-testid="button-grant-permission"
              >
                <Mic className="h-4 w-4 mr-2" />
                Grant Microphone Access
              </Button>
            </div>
          )}

          {permissionGranted && (
            <>
              {/* Microphone Selection */}
              <div className="space-y-2">
                <Label htmlFor="microphone" className="flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Microphone
                </Label>
                <Select 
                  value={selectedMic} 
                  onValueChange={setSelectedMic}
                >
                  <SelectTrigger id="microphone" data-testid="select-microphone">
                    <SelectValue placeholder="Select microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    {microphones.map(mic => (
                      <SelectItem 
                        key={mic.deviceId} 
                        value={mic.deviceId}
                        data-testid={`option-mic-${mic.deviceId}`}
                      >
                        {mic.label}
                      </SelectItem>
                    ))}
                    {microphones.length === 0 && (
                      <SelectItem value="none" disabled>
                        No microphones found
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedMic && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={testMicrophone}
                    className="w-full"
                    data-testid="button-test-microphone"
                  >
                    Test Microphone
                  </Button>
                )}
              </div>

              {/* Speaker Selection */}
              <div className="space-y-2">
                <Label htmlFor="speaker" className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Speaker / Headphones
                </Label>
                <Select 
                  value={selectedSpeaker} 
                  onValueChange={setSelectedSpeaker}
                >
                  <SelectTrigger id="speaker" data-testid="select-speaker">
                    <SelectValue placeholder="Select speaker" />
                  </SelectTrigger>
                  <SelectContent>
                    {speakers.map(speaker => (
                      <SelectItem 
                        key={speaker.deviceId} 
                        value={speaker.deviceId}
                        data-testid={`option-speaker-${speaker.deviceId}`}
                      >
                        {speaker.label}
                      </SelectItem>
                    ))}
                    {speakers.length === 0 && (
                      <SelectItem value="none" disabled>
                        No speakers found
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-audio-settings"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={!selectedMic || !selectedSpeaker}
                  data-testid="button-save-audio-settings"
                >
                  Save Settings
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
