"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dialects = void 0;
const mssql_1 = require("./mssql");
const mysql_1 = require("./mysql");
const postgres_1 = require("./postgres");
const sqlite_1 = require("./sqlite");
const not_implemented_1 = require("./not-implemented");
exports.dialects = {
    mssql: mssql_1.mssqlOptions,
    mysql: mysql_1.mysqlOptions,
    mariadb: mysql_1.mysqlOptions,
    postgres: postgres_1.postgresOptions,
    sqlite: sqlite_1.sqliteOptions,
    db2: not_implemented_1.NotImplementedOptions,
    snowflake: not_implemented_1.NotImplementedOptions,
    oracle: not_implemented_1.NotImplementedOptions
};
//# sourceMappingURL=dialects.js.map