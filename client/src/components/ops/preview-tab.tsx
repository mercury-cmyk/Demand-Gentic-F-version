import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  ExternalLink,
  Maximize2,
  Minimize2,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Home,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom';

const VIEWPORT_PRESETS: Record<ViewportPreset, { width: number; height: number; label: string }> = {
  desktop: { width: 1440, height: 900, label: 'Desktop (1440×900)' },
  tablet: { width: 768, height: 1024, label: 'Tablet (768×1024)' },
  mobile: { width: 375, height: 812, label: 'Mobile (375×812)' },
  custom: { width: 1200, height: 800, label: 'Custom' },
};

const QUICK_ROUTES = [
  { path: '/', label: 'Home / Dashboard' },
  { path: '/campaigns', label: 'Campaigns' },
  { path: '/leads', label: 'Leads' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/call-center', label: 'Call Center' },
  { path: '/settings', label: 'Settings' },
  { path: '/ops-hub', label: 'Ops Hub' },
  { path: '/client-portal', label: 'Client Portal' },
  { path: '/preview-studio', label: 'Preview Studio' },
];

export default function PreviewTab() {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [previewUrl, setPreviewUrl] = useState('http://localhost:5000');
  const [urlInput, setUrlInput] = useState('http://localhost:5000');
  const [viewport, setViewport] = useState<ViewportPreset>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy'>('checking');
  const [history, setHistory] = useState<string[]>(['http://localhost:5000']);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Check server health
  const checkHealth = useCallback(async () => {
    setHealthStatus('checking');
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
      setHealthStatus(res.ok ? 'healthy' : 'unhealthy');
    } catch {
      setHealthStatus('unhealthy');
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const navigate = (url: string) => {
    setPreviewUrl(url);
    setUrlInput(url);
    setLoading(true);
    // Trim history forward from current position and push
    const newHistory = [...history.slice(0, historyIndex + 1), url];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      setPreviewUrl(history[idx]);
      setUrlInput(history[idx]);
      setLoading(true);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      setPreviewUrl(history[idx]);
      setUrlInput(history[idx]);
      setLoading(true);
    }
  };

  const handleReload = () => {
    setLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = previewUrl;
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(urlInput);
  };

  const handleQuickRoute = (path: string) => {
    const base = 'http://localhost:5000';
    navigate(base + path);
  };

  const openExternal = () => {
    window.open(previewUrl, '_blank');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const vp = VIEWPORT_PRESETS[viewport];

  return (
    <div className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-[100] bg-slate-900 p-4' : ''}`}>
      {/* Controls Bar */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            {/* Health indicator */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-600">
              {healthStatus === 'checking' && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
              {healthStatus === 'healthy' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
              {healthStatus === 'unhealthy' && <XCircle className="w-4 h-4 text-red-400" />}
              <span className="text-xs text-slate-400">
                {healthStatus === 'checking' ? 'Checking...' : healthStatus === 'healthy' ? 'Server up' : 'Server down'}
              </span>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={goBack} disabled={historyIndex <= 0} className="h-7 w-7 p-0">
                <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goForward} disabled={historyIndex >= history.length - 1} className="h-7 w-7 p-0">
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReload} className="h-7 w-7 p-0">
                <RotateCcw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleQuickRoute('/')} className="h-7 w-7 p-0">
                <Home className="w-3.5 h-3.5 text-slate-400" />
              </Button>
            </div>

            {/* URL bar */}
            <form onSubmit={handleUrlSubmit} className="flex-1">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="h-8 pl-8 bg-slate-700 border-slate-600 text-white text-sm font-mono placeholder:text-slate-500"
                    placeholder="http://localhost:5000"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm" className="h-8 border-slate-600">
                  Go
                </Button>
              </div>
            </form>

            {/* Viewport controls */}
            <div className="flex items-center gap-1 pl-3 border-l border-slate-600">
              <Button
                variant={viewport === 'desktop' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewport('desktop')}
                className="h-7 w-7 p-0"
                title="Desktop"
              >
                <Monitor className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={viewport === 'tablet' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewport('tablet')}
                className="h-7 w-7 p-0"
                title="Tablet"
              >
                <Tablet className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={viewport === 'mobile' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewport('mobile')}
                className="h-7 w-7 p-0"
                title="Mobile"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 pl-3 border-l border-slate-600">
              <Button variant="ghost" size="sm" onClick={openExternal} className="h-7 w-7 p-0" title="Open in new tab">
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleFullscreen} className="h-7 w-7 p-0" title="Fullscreen">
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-slate-400" /> : <Maximize2 className="w-3.5 h-3.5 text-slate-400" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={`flex gap-4 ${isFullscreen ? 'h-[calc(100vh-120px)]' : ''}`}>
        {/* Quick Routes Sidebar (collapsed in fullscreen) */}
        {!isFullscreen && (
          <Card className="bg-slate-800 border-slate-700 w-48 shrink-0">
            <CardHeader className="py-3 px-3">
              <CardTitle className="text-sm text-white">Quick Routes</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3 space-y-0.5">
              {QUICK_ROUTES.map((route) => (
                <button
                  key={route.path}
                  onClick={() => handleQuickRoute(route.path)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                    previewUrl.endsWith(route.path) || (route.path === '/' && previewUrl === 'http://localhost:5000')
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {route.label}
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Preview Frame */}
        <Card className="bg-slate-800 border-slate-700 flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            <div className="flex items-center justify-center bg-slate-900/50 h-full min-h-[600px]">
              <div
                className="bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300 relative"
                style={{
                  width: isFullscreen ? '100%' : Math.min(vp.width, 1400),
                  height: isFullscreen ? '100%' : Math.min(vp.height, 800),
                  maxWidth: '100%',
                  maxHeight: '100%',
                }}
              >
                {loading && (
                  <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-10">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                      <span className="text-sm text-slate-300">Loading...</span>
                    </div>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={previewUrl}
                  className="w-full h-full border-0"
                  onLoad={() => setLoading(false)}
                  onError={() => setLoading(false)}
                  title="Local App Preview"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                />
              </div>
            </div>
            {/* Viewport label */}
            {!isFullscreen && (
              <div className="bg-slate-900/80 px-3 py-1.5 text-center">
                <span className="text-xs text-slate-500">{vp.label}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
