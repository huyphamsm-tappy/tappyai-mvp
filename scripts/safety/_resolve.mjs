// Resolution hook so the safety scripts can run under plain `node`.
//
// Next resolves `@/x` → `src/x` and adds the `.ts` extension; plain Node does
// neither. This teaches it both, and nothing else — it does not transform code,
// so what runs is exactly what ships.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = path.resolve(import.meta.dirname, '..', '..', 'src');

const withExtensions = async (specifier, context, next) => {
  try {
    return await next(specifier, context);
  } catch (err) {
    for (const suffix of ['.ts', '/index.ts', '.tsx', '.mjs']) {
      try {
        return await next(specifier + suffix, context);
      } catch {
        // try the next candidate
      }
    }
    throw err;
  }
};

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = pathToFileURL(path.join(SRC, specifier.slice(2))).href;
    return withExtensions(target, context, next);
  }
  return withExtensions(specifier, context, next);
}
