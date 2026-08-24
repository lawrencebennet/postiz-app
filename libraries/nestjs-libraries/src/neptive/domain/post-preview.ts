export function postPreviewText(content: unknown): string {
  if (content == null) {
    return '';
  }
  let value: unknown = content;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    try {
      value = JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => postPreviewText(item))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const record = value as { content?: unknown; text?: unknown };
    if (record.content != null) {
      return postPreviewText(record.content);
    }
    if (typeof record.text === 'string') {
      return record.text;
    }
  }
  return String(value);
}
