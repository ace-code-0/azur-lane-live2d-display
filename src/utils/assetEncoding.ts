// 路径：src/utils/assetEncoding.ts

const UNRESERVED = /[A-Za-z0-9.\-]/; // 保留字符

/**
 * 将资产名称编码为安全的 URL/文件名格式
 * 规则：
 * _  → __
 * 其他非保留字符 → _ + 两位十六进制 ASCII
 */
export function encodeAssetName(input: string): string {
  let out = '';

  for (const ch of input) {
    if (ch === '_') {
      out += '__';
      continue;
    }

    if (UNRESERVED.test(ch)) {
      out += ch;
      continue;
    }

    const code = ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    out += '_' + code;
  }

  return out;
}

/**
 * 解码由 encodeAssetName 编码的资产名称
 */
export function decodeAssetName(input: string): string {
  let out = '';

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch !== '_') {
      out += ch;
      continue;
    }

    const next = input[i + 1];

    // "__" → "_"
    if (next === '_') {
      out += '_';
      i++;
      continue;
    }

    // "_XX" → hex
    const hex = input.slice(i + 1, i + 3);

    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      out += String.fromCharCode(parseInt(hex, 16));
      i += 2;
      continue;
    }

    // fallback（理论不会发生）
    out += '_';
  }

  return out;
}
