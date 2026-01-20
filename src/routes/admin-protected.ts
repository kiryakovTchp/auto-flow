import { Router } from 'express';

import { requireAdminBasicAuth } from '../security/admin-basic-auth';
import { adminApiRouter } from './admin-api';

export function adminProtectedApiRouter(): Router {
  const r = Router();
  r.use(requireAdminBasicAuth);
  r.use(adminApiRouter());
  return r;
}
