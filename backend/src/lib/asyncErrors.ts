import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Layer = require('express/lib/router/layer');

type Next = (err?: unknown) => void;
type Handle = (req: unknown, res: unknown, next: Next) => unknown;

const original = Layer.prototype.handle_request as (req: unknown, res: unknown, next: Next) => void;

Layer.prototype.handle_request = function handleAsync(this: { handle: Handle }, req: unknown, res: unknown, next: Next) {
  if (this.handle.length > 3) return original.call(this, req, res, next);
  try {
    const result = this.handle(req, res, next);
    const maybe = result as { catch?: (fn: Next) => void } | null;
    if (maybe && typeof maybe.catch === 'function') maybe.catch(next);
  } catch (err) {
    next(err);
  }
};
