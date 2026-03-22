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

const VIEWPORT_PRESETS: Record = {
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
  const iframeRef = useRef(null);

  const browserOrigin = typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:5000';

  const fallbackBaseUrl = resolvePreviewBaseUrl(undefined, browserOrigin);

  const [baseUrl, setBaseUrl] = useState(fallbackBaseUrl);
  const [previewUrl, setPreviewUrl] = useState(fallbackBaseUrl);
  const [urlInput, setUrlInput] = useState(fallbackBaseUrl);
  const [viewport, setViewport] = useState('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState('checking');
  const [history, setHistory] = useState([fallbackBaseUrl]);
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
        const data = await apiJsonRequest('GET', '/api/ops/overview');
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
    if (historyIndex  {
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
    
      
        
          
            
              {healthStatus === 'checking' && }
              {healthStatus === 'healthy' && }
              {healthStatus === 'unhealthy' && }
              
                {healthStatus === 'checking' ? 'Checking...' : healthStatus === 'healthy' ? 'Server healthy' : 'Server unavailable'}
              
            

            
              
                
              
              = history.length - 1} className="h-8 w-8 p-0">
                
              
              
                
              
               handleQuickRoute('/')} className="h-8 w-8 p-0">
                
              
            

            
              
                
                  
                   setUrlInput(event.target.value)}
                    className="h-9 border-slate-200 bg-[#faf7f0] pl-8 text-sm font-mono text-slate-900"
                    placeholder={baseUrl}
                  />
                
                
                  Go
                
              
            

            
               setViewport('desktop')}
                className="h-8 w-8 p-0"
              >
                
              
               setViewport('tablet')}
                className="h-8 w-8 p-0"
              >
                
              
               setViewport('mobile')}
                className="h-8 w-8 p-0"
              >
                
              
              
                
              
               setIsFullscreen((value) => !value)} className="h-8 w-8 p-0">
                {isFullscreen ?  : }
              
            
          
        
      

      
        {!isFullscreen && (
          
            
              
                Quick Routes
              
              {QUICK_ROUTES.map((route) => {
                const targetUrl = withPath(baseUrl, route.path);
                const active = previewUrl === targetUrl;
                return (
                   handleQuickRoute(route.path)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-[#faf7f0] hover:text-slate-900'
                    }`}
                  >
                    {route.label}
                  
                );
              })}
            
          
        )}

        
          
            
              
                {loading && (
                  
                    
                      
                      Loading preview...
                    
                  
                )}
                 setLoading(false)}
                  onError={() => setLoading(false)}
                  title="Ops Hub Preview"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                />
              
            
            {!isFullscreen && (
              
                {vp.label} | Base URL {baseUrl}
              
            )}
          
        
      
    
  );
}