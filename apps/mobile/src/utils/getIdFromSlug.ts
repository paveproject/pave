export const getIdFromSlug = (slug: string) => {
  const [id, title] = slug.split('-');
  return {
    id: parseInt(id),
    isTitle: !!title,
  };
};
