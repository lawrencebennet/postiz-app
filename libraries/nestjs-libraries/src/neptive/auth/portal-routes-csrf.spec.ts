import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { portalRequestProblem } from './request-guards';

// Every portal controller (any @Controller whose path starts with /neptive/portal, anywhere in the backend)
// must be bound to NeptiveSameOriginMiddleware in neptive.api.module.ts: a route added later is then
// covered by default, and a new portal controller cannot be added without it unnoticed.

const BACKEND = join(__dirname, '../../../../../apps/backend/src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function portalControllers() {
  const found: Array<{ file: string; name: string; path: string }> = [];
  for (const file of files(BACKEND)) {
    const source = readFileSync(file, 'utf8');
    const re = /@Controller\(\s*['"`]\/?(neptive\/portal[^'"`]*)['"`]\s*\)\s*export\s+class\s+(\w+)/g;
    for (const match of source.matchAll(re)) {
      found.push({ file, path: match[1], name: match[2] });
    }
  }
  return found;
}

function boundToSameOrigin() {
  const module = readFileSync(join(BACKEND, 'neptive/neptive.api.module.ts'), 'utf8');
  const match = module.match(/\.apply\(\s*NeptiveSameOriginMiddleware\s*\)\s*\.forRoutes\(([^)]*)\)/);
  return match ? match[1].split(',').map((name) => name.trim()).filter(Boolean) : [];
}

describe('portal CSRF coverage', () => {
  it('finds the portal controllers', () => {
    expect(portalControllers().map((c) => c.name).sort()).toEqual(
      ['NeptivePortalAccountController', 'NeptivePortalAuthController', 'NeptivePortalController'].sort()
    );
  });

  it('binds NeptiveSameOriginMiddleware to every portal controller', () => {
    const bound = boundToSameOrigin();
    for (const controller of portalControllers()) {
      expect({ controller: controller.name, bound: bound.includes(controller.name) }).toEqual({
        controller: controller.name,
        bound: true,
      });
    }
  });

  it('the middleware enforces portalRequestProblem and nothing weaker', () => {
    const source = readFileSync(join(BACKEND, 'neptive/same-origin.middleware.ts'), 'utf8');
    expect(source).toMatch(/portalRequestProblem\(req\.method, req\.headers/);
    expect(source).toMatch(/throw new ForbiddenException/);
  });
});

describe('portalRequestProblem on every existing portal mutation', () => {
  const FRONTEND = 'https://portal.neptive.com';
  const good = { 'content-type': 'application/json', origin: FRONTEND };
  const mutations: Array<[string, string]> = [
    ['POST', '/neptive/portal-auth/magic'],
    ['POST', '/neptive/portal-auth/login'],
    ['POST', '/neptive/portal-auth/logout'],
    ['POST', '/neptive/portal/peds/:id/transition'],
    ['POST', '/neptive/portal/approvals/:id/transition'],
    ['POST', '/neptive/portal/approvals/:id/comments'],
    ['POST', '/neptive/portal/account/password'],
  ];

  it('lists every POST/PUT/PATCH/DELETE handler of the portal controllers', () => {
    const source = readFileSync(join(BACKEND, 'neptive/portal.controller.ts'), 'utf8');
    const handlers = [...source.matchAll(/@(Post|Put|Patch|Delete)\(/g)].length;
    expect(handlers).toBe(mutations.length);
  });

  it.each(mutations)('%s %s: refused cross-site, as a form, without origin; allowed same-origin JSON', (method) => {
    expect(portalRequestProblem(method, good, FRONTEND)).toBeNull();
    expect(portalRequestProblem(method, { ...good, origin: 'https://evil.example' }, FRONTEND)).toBeTruthy();
    expect(portalRequestProblem(method, { ...good, origin: 'null' }, FRONTEND)).toBeTruthy();
    expect(portalRequestProblem(method, { origin: FRONTEND, 'content-type': 'application/x-www-form-urlencoded' }, FRONTEND)).toBeTruthy();
    expect(portalRequestProblem(method, { origin: FRONTEND, 'content-type': 'text/plain' }, FRONTEND)).toBeTruthy();
    expect(portalRequestProblem(method, { origin: FRONTEND, 'content-type': 'multipart/form-data; boundary=x' }, FRONTEND)).toBeTruthy();
    expect(portalRequestProblem(method, { 'content-type': 'application/json' }, FRONTEND)).toBeTruthy();
    expect(portalRequestProblem(method, { 'content-type': 'application/json', referer: `${FRONTEND}/portal/approvals` }, FRONTEND)).toBeNull();
  });

  it('applies to any other verb, and lets reads through', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE', 'PROPFIND']) {
      expect(portalRequestProblem(method, {}, FRONTEND)).toBeTruthy();
    }
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(portalRequestProblem(method, {}, FRONTEND)).toBeNull();
    }
  });

  it('local dev: the frontend origin on another port is the allowed one', () => {
    const dev = 'http://localhost:4200';
    expect(portalRequestProblem('POST', { 'content-type': 'application/json', origin: dev }, dev)).toBeNull();
    expect(portalRequestProblem('POST', { 'content-type': 'application/json', origin: 'http://localhost:3000' }, dev)).toBeTruthy();
  });
});
