import { pool } from './pool';

export async function markDeliveryProcessed(provider: 'asana' | 'github', deliveryId: string): Promise<boolean> {
  // Returns true if we inserted (new), false if it already existed.
  const res = await pool.query(
    `
      insert into webhook_deliveries (provider, delivery_id)
      values ($1, $2)
      on conflict (provider, delivery_id) do nothing
      returning id
    `,
    [provider, deliveryId],
  );
  return res.rowCount === 1;
}
