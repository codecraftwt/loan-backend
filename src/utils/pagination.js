const paginateQuery = async (
  model,
  query,
  page = 1,
  limit = 10,
  options = { sort: { createdAt: -1 }, populate: "", select: "" }
) => {
  page = Math.max(1, Number(page));
  limit = Math.max(1, Number(limit));

  const queryBuilder = model.find(query);

  if (options.sort) queryBuilder.sort(options.sort);
  if (options.populate) queryBuilder.populate(options.populate);
  if (options.select) queryBuilder.select(options.select);

  const [data, totalDocuments] = await Promise.all([
    queryBuilder
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    model.countDocuments(query),
  ]);

  return {
    data,
    pagination: {
      totalDocuments,
      currentPage: page,
      totalPages: Math.ceil(totalDocuments / limit),
    },
  };
};

module.exports = paginateQuery;
