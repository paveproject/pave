const richTextToPlainString = (node: React.ReactNode): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return node.toString();
  if (Array.isArray(node)) return node.map(richTextToPlainString).join('');
  if (typeof node === 'object' && 'props' in node) {
    return richTextToPlainString((node as any).props?.children);
  }
  return '';
};

export default richTextToPlainString;
