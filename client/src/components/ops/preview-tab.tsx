import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Monitor,
  Smartphone,
  Tablet,
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
import { apiJsonRequest } from '@/lib/queryClient';

type ViewportPreset = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_PRESETS: Record<ViewportPreset, { width: number; height: number; label: string }> = {
  desktop: { width: 1440, height: 900, label: 'Desktop (1440x900)' },
  tablet: { width: 768, height: 1024, label: 'Tablet (768x1024)' },
  mobile: { width: 375, height: 812, label: 'Mobile (375x812)' },
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

const CLOUD_WORKSTATIONS_SUFFIX = 'cloudworkstations.dev';
const DEFAULT_PREVIEW_PORT = 5000;

function isLocalhostUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function getPreviewPort(candidateBaseUrl: string | undefined): number {
  if (!candidateBaseUrl || !isLocalhostUrl(candidateBaseUrl)) {
    return DEFAULT_PREVIEW_PORT;
  }

  try {
    const parsed = new URL(candidateBaseUrl);
    const parsedPort = Number(parsed.port || DEFAULT_PREVIEW_PORT);
    return Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PREVIEW_PORT;
  } catch {
    return DEFAULT_PREVIEW_PORT;
  }
}

function getCloudWorkstationsPreviewOrigin(browserOrigin: string, port: number): string | null {
  try {
    const currentUrl = new URL(browserOrigin);
    const currentHost = currentUrl.hostname;
    if (!currentHost.endsWith(CLOUD_WORKSTATIONS_SUFFIX)) {
      return null;
    }

    const prefixedHostMatch = currentHost.match(/^(\d+)(?:-dot-|-)(.+)$/);
    if (prefixedHostMatch) {
      const [, currentPort, baseHost] = prefixedHostMatch;
      if (Number(currentPort) === port) {
        return `${currentUrl.protocol}//${currentUrl.host}`;
      }

      return `${currentUrl.protocol}//${port}-dot-${baseHost}`;
    }

    return `${currentUrl.protocol}//${port}-dot-${currentUrl.host}`;
  } catch {
    return null;
  }
}

function resolvePreviewBaseUrl(candidateBaseUrl: string | undefined, browserOrigin: string): string {
  const trimmedCandidate = candidateBaseUrl?.trim();
  const workstationPreviewOrigin = getCloudWorkstationsPreviewOrigin(
    browserOrigin,
    getPreviewPort(trimmedCandidate),
  );

  if (workstationPreviewOrigin && (!trimmedCandidate || isLocalhostUrl(trimmedCandidate) || trimmedCandidate === browserOrigin)) {
    return workstationPreviewOrigin;
  }

  return trimmedCandidate || workstationPreviewOrigin || browserOrigin;
}

function withPath(baseUrl: string, routePath: string): string {
  try {
    return new URL(routePath, `${baseUrl.replace(/\/$/, '')}/`).toString();
  } catch {
    return `${baseUrl.replace(/\/$/, '')}${routePath}`;
  }
}

export default function PreviewTab() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const browserOrigin = typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:5000';

  const fallbackBaseUrl = resolvePreviewBaseUrl(undefined, browserOrigin);

  const [baseUrl, setBaseUrl] = useState(fallbackBaseUrl);
  const [previewUrl, setPreviewUrl] = useState(fallbackBaseUrl);
  const [urlInput, setUrlInput] = useState(fallbackBaseUrl);
  const [viewport, setViewport] = useState<ViewportPreset>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy'>('checking');
  const [history, setHistory] = useState<string[]>([fallbackBaseUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const checkHealth = useCallback(async () => {
    setHealthStatus('checking');
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
      setHealthStatus(response.ok ? 'healthy' : 'unhealthy');
    } catch {
      setHealthStatus('unhealthy');
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  useEffect(() => {
    const loadOverview = async () => {
      try {
        const data = await apiJsonRequest<{
          success: boolean;
          overview?: { previewBaseUrl?: string };
        }>('GET', '/api/ops/overview');
        if (!data.success) {
          return;
        }

        const nextBaseUrl = resolvePreviewBaseUrl(data.overview?.previewBaseUrl, browserOrigin);
        setBaseUrl(nextBaseUrl);
        setPreviewUrl(nextBaseUrl);
        setUrlInput(nextBaseUrl);
        setHistory([nextBaseUrl]);
        setHistoryIndex(0);
      } catch {
        setBaseUrl(fallbackBaseUrl);
      }
    };

    loadOverview();
  }, [browserOrigin, fallbackBaseUrl]);

  const navigate = (url: string) => {
    setPreviewUrl(url);
    setUrlInput(url);
    setLoading(true);
    const nextHistory = [...history.slice(0, historyIndex + 1), url];
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const goBack = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const nextUrl = history[nextIndex];
    setHistoryIndex(nextIndex);
    setPreviewUrl(nextUrl);
    setUrlInput(nextUrl);
    setLoading(true);
  };

  const goForward = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const nextUrl = history[nextIndex];
    setHistoryIndex(nextIndex);
    setPreviewUrl(nextUrl);
    setUrlInput(nextUrl);
    setLoading(true);
  };

  const handleReload = () => {
    setLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = previewUrl;
    }
  };

  const handleUrlSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    navigate(urlInput);
  };

  const handleQuickRoute = (routePath: string) => {
    navigate(withPath(baseUrl, routePath));
  };

  const openExternal = () => {
    window.open(previewUrl, '_blank');
  };

  const vp = VIEWPORT_PRESETS[viewport];

  return (
    <div className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-[100] bg-[#f5f2ea] p-4' : ''}`}>
      <Card className="border-black/5 bg-white/90 shadow-sm">
        <CardContent className="py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3 text-xs text-slate-500">
              {healthStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin" />}
              {healthStatus === 'healthy' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {healthStatus === 'unhealthy' && <XCircle className="w-4 h-4 text-red-500" />}
              <span>
                {healthStatus === 'checking' ? 'Checking...' : healthStatus === 'healthy' ? 'Server healthy' : 'Server unavailable'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={goBack} disabled={historyIndex <= 0} className="h-8 w-8 p-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goForward} disabled={historyIndex >= history.length - 1} className="h-8 w-8 p-0">
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReload} className="h-8 w-8 p-0">
                <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleQuickRoute('/')} className="h-8 w-8 p-0">
                <Home className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleUrlSubmit} className="flex-1">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                    className="h-9 border-slate-200 bg-[#faf7f0] pl-8 text-sm font-mono text-slate-900"
                    placeholder={baseUrl}
                  />
                </div>
                <Button type="submit" variant="outline" size="sm" className="h-9 border-slate-200 bg-white">
                  Go
                </Button>
              </div>
            </form>

            <div className="flex items-center gap-1">
              <Button
                variant={viewport === 'desktop' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewport('desktop')}
                className="h-8 w-8 p-0"
              >
                <Monitor className="w-4 h-4" />
              </Button>
              <Button
                variant={viewport === 'tablet' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewport('tablet')}
                className="h-8 w-8 p-0"
              >
                <Tablet className="w-4 h-4" />
              </Button>
              <Button
                variant={viewport === 'mobile' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewport('mobile')}
                className="h-8 w-8 p-0"
              >
                <Smartphone className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={openExternal} className="h-8 w-8 p-0">
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsFullscreen((value) => !value)} className="h-8 w-8 p-0">
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={`flex gap-4 ${isFullscreen ? 'h-[calc(100vh-120px)]' : ''}`}>
        {!isFullscreen && (
          <Card className="w-56 shrink-0 border-black/5 bg-white/90 shadow-sm">
            <CardContent className="space-y-1 p-3">
              <div className="px-2 py-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                Quick Routes
              </div>
              {QUICK_ROUTES.map((route) => {
                const targetUrl = withPath(baseUrl, route.path);
                const active = previewUrl === targetUrl;
                return (
                  <button
                    key={route.path}
                    onClick={() => handleQuickRoute(route.path)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-[#faf7f0] hover:text-slate-900'
                    }`}
                  >
                    {route.label}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="flex-1 overflow-hidden border-black/5 bg-white/90 shadow-sm">
          <CardContent className="h-full p-0">
            <div className="flex h-full min-h-[620px] items-center justify-center bg-[#f7f3ea] p-4">
              <div
                className="relative overflow-hidden rounded-2xl bg-white shadow-[0_32px_70px_-38px_rgba(15,23,42,0.5)] transition-all duration-300"
                style={{
                  width: isFullscreen ? '100%' : Math.min(vp.width, 1400),
                  height: isFullscreen ? '100%' : Math.min(vp.height, 820),
                  maxWidth: '100%',
                  maxHeight: '100%',
                }}
              >
                {loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85">
                    <div className="flex flex-col items-center gap-2 text-slate-600">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                      Loading preview...
                    </div>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={previewUrl}
                  className="h-full w-full border-0"
                  onLoad={() => setLoading(false)}
                  onError={() => setLoading(false)}
                  title="Ops Hub Preview"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                />
              </div>
            </div>
            {!isFullscreen && (
              <div className="border-t border-slate-200 bg-[#faf7f0] px-3 py-2 text-center text-xs text-slate-500">
                {vp.label} | Base URL {baseUrl}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
