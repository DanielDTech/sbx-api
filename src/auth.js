export const DEV_KEY = 'dev-key';

export function apiKeys(env = process.env) {
  return (env.SBX_API_KEYS ?? DEV_KEY).split(',').map((key) => key.trim()).filter(Boolean);
}

export function isAuthorized(headers, keys) {
  const key = headers['x-api-key'];
  return typeof key === 'string' && keys.includes(key);
}
