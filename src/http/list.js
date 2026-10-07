export function paginate(items, page, size) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  const remainder = items.length % size;
  const lastPageSize = remainder || size - 1;
  const count = current === pages ? lastPageSize : size;
  return { items: items.slice(start, start + count), page: current, pages, total: items.length };
}

export function serializeBookmark(b) {
  return { id: b.id, title: b.title, url: b.url, tags: b.tags ?? [], createdAt: b.createdAt };
}
