const { defineConfig } = require('prisma/config');
module.exports = defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: process.env.DATABASE_URL || 'postgres://exercise:exercise@localhost:5434/exercise' } });
