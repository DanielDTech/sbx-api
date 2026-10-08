export function paginate(items, page, size) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pages, total: items.length };
}

export function serializeBookmark(b) {
  const optionalNote = b.note === undefined ? {} : { note: b.note };
  return { id: b.id, title: b.title, url: b.url, tags: b.tags ?? [], createdAt: b.createdAt, ...optionalNote };
}
