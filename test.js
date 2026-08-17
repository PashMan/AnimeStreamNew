function getQuery() {
  const keys = [];
  const table = 'profiles';
  const setClause = keys.map(k => `"${k}" = ?`).join(', ');
  const whereClause = ' WHERE email = ?';
  const query = `UPDATE ${table} SET ${setClause}${whereClause} RETURNING *`;
  return query;
}
console.log(getQuery());
