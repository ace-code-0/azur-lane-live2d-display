export function escapePathSegment(input: string): string {
  let out = '';

  for (const ch of input) {
    if (/[A-Za-z0-9._\-]/.test(ch)) {
      out += ch;
      continue;
    }

    const hex = ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    out += `ascii__${hex}`;
  }

  return out;
}

export function unescapePathSegment(input: string): string {
  return input.replace(/ascii__([0-9A-Fa-f]{2})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

export function createEscapedPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(escapePathSegment)
    .join('/');
}
