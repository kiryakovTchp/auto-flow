import { Router } from 'express';

import { requireAdminBasicAuth } from '../security/admin-basic-auth';
import { adminUiRouter } from './admin-ui';

export function adminUiProtectedRouter(): Router {
  const r = Router();
  r.use(requireAdminBasicAuth);
  r.use(adminUiRouter());
  return r;
}
