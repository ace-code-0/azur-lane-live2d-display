export function encodeAssetName(input: string): string {
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

export function decodeAssetName(input: string): string {
  return input.replace(/ascii__([0-9A-Fa-f]{2})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}
