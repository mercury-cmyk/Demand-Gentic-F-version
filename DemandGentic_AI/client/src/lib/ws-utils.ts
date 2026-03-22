/**
 * Utility for constructing WebSocket URLs across development and production
 * Handles port resolution correctly on all platforms
 */

export function getWebSocketURL(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  // Get hostname (without port)
  const hostname = window.location.hostname;
  
  // Get port - use the server's port, not the frontend dev server port
  // In development, this will be 5000 (our backend port)
  // In production, this will be the actual port from the URL or undefined (use default)
  let port = '';
  
  if (window.location.port) {
    // If a port is explicitly set in the URL, use it
    port = `:${window.location.port}`;
  } else if (window.location.protocol === 'https:') {
    // HTTPS defaults to 443, don't add it
    port = '';
  } else if (window.location.protocol === 'http:') {
    // HTTP defaults to 80, don't add it
    port = '';
  }
  
  // If we're on localhost or 127.0.0.1 without a port, use the backend port
  // This handles development where frontend is on :3000 but backend is on :5000
  if (!port && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    port = ':5000';
  }
  
  const url = `${protocol}//${hostname}${port}${path}`;
  console.log(`[WS] Constructed WebSocket URL: ${url}`);
  return url;
}

export function createWebSocket(path: string, token?: string): WebSocket {
  let url = getWebSocketURL(path);
  
  // Add token if provided
  if (token) {
    const separator = url.includes('?') ? '&' : '?';
    url += `${separator}token=${token}`;
  }
  
  return new WebSocket(url);
}