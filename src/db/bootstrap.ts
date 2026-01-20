import bcrypt from 'bcryptjs';

import { getAdminUser, upsertAdminUser } from './admin-users';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'ChOab8ug!';

export async function ensureDefaultAdminUser(): Promise<void> {
  const existing = await getAdminUser(DEFAULT_ADMIN_USERNAME);
  if (existing) return;

  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  await upsertAdminUser({ username: DEFAULT_ADMIN_USERNAME, passwordHash: hash });

  // eslint-disable-next-line no-console
  console.log('Created default admin user: admin / ChOab8ug! (please change ASAP)');
}
