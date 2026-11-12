// ВК хранит не больше 4096 байт на значение. Кириллица в UTF-8 занимает 2 байта на букву,
// поэтому 1500 символов гарантированно помещаются.
export const CHUNK = 1500;

export function chunk(s: string, size = CHUNK): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}
