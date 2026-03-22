/**
 * Unified Agent Architecture Routes
 * 
 * Wraps the unified agent routes module from server/services/agents/unified/routes.ts
 * and re-exports for registration in server/routes.ts
 */

import unifiedAgentRoutes from '../services/agents/unified/routes';

export default unifiedAgentRoutes;