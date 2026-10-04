const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');

exports.createD1 = schema => {
  const database = new DatabaseSync(':memory:');
  for (const file of Array.isArray(schema) ? schema : [schema]) database.exec(readFileSync(file, 'utf8'));
  return {
    database,
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return database.prepare(sql).get(...args) ?? null; },
        async run() { return { success: true, meta: database.prepare(sql).run(...args) }; },
      };
      return statement;
    },
    async batch(statements) {
      database.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
    close() { database.close(); },
  };
};
