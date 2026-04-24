// 路径：src/utils/assetEncoding.ts

/**
 * 保留字符集：字母、数字、点(.)、下划线(_)、连字符(-)
 * 注意：根据要求，下划线不再进行替换。
 */
const UNRESERVED = /[A-Za-z0-9._\-]/;

/**
 * 将资产名称编码为安全的 URL/文件名格式
 * 规则：
 * 1. 保留字符直接输出
 * 2. 其他字符转换为 ascii__[两位十六进制ASCII]
 * 示例：'#' -> 'ascii__23'
 */
export function encodeAssetName(input: string): string {
  let out = '';

  for (const ch of input) {
    if (UNRESERVED.test(ch)) {
      out += ch;
      continue;
    }

    const hex = ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    out += `ascii__${hex}`;
  }

  return out;
}

/**
 * 解码由 encodeAssetName 编码的资产名称
 */
export function decodeAssetName(input: string): string {
  // 使用正则匹配 ascii__[XX] 并还原
  return input.replace(/ascii__([0-9A-Fa-f]{2})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}
