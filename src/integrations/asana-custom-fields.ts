import { request } from 'undici';

// Minimal Asana custom fields API helper for enum options.
export async function addEnumOptionToCustomField(params: {
  asanaPat: string;
  customFieldGid: string;
  optionName: string;
}): Promise<void> {
  const url = `https://app.asana.com/api/1.0/custom_fields/${params.customFieldGid}/enum_options`;

  const res = await request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.asanaPat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { name: params.optionName } }),
  });

  const text = await res.body.text();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Asana API POST enum_options failed: ${res.statusCode} ${text}`);
  }
}
