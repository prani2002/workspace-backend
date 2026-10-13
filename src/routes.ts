import type { RouteDef } from './http/types';
import { systemRoutes } from './modules/system/routes';
import { authRoutes } from './modules/auth/routes';
import { adminRoutes } from './modules/admin/routes';
import { agentRoutes } from './modules/agents/routes';
// @fde:imports (new-feature.mjs inserts imports above this line)

export const allRoutes: RouteDef[] = [
  ...systemRoutes,
  ...authRoutes,
  ...adminRoutes,
  ...agentRoutes
  // @fde:routes (new-feature.mjs inserts route arrays above this line)
];
