/**
 * Where the app under test lives. `E2E_BASE_URL` is set by the `e2e` service in
 * docker-compose.yml, where the app is reachable as `web:4200` on the compose network; unset
 * on a host it falls back to the dev-server default. Assertions that need the absolute URL
 * build it from here rather than hardcoding a host, so the same specs pass in both places.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';

const escaped = BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The wall root, with the optional `?highlight=<id>` the submit redirect adds. Anchored at
 * both ends so it stays as strict as the hardcoded literal it replaced — `/tv` must not match. */
export const WALL_URL = new RegExp(`^${escaped}/(\\?highlight=\\d+)?$`);
