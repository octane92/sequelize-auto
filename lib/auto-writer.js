"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoWriter = void 0;
const fs_1 = __importDefault(require("fs"));
const lodash_1 = __importDefault(require("lodash"));
const path_1 = __importDefault(require("path"));
const util_1 = __importDefault(require("util"));
const types_1 = require("./types");
const mkdirp = require('mkdirp');
/** Writes text into files from TableData.text, and writes init-models */
class AutoWriter {
    constructor(tableData, options) {
        this.tableText = tableData.text;
        this.foreignKeys = tableData.foreignKeys;
        this.relations = tableData.relations;
        this.options = options;
        this.space = (0, types_1.makeIndent)(this.options.spaces, this.options.indentation);
    }
    write() {
        if (this.options.noWrite) {
            return Promise.resolve();
        }
        mkdirp.sync(path_1.default.resolve(this.options.directory || "./models"));
        const tables = lodash_1.default.keys(this.tableText);
        // write the individual model files
        const promises = tables.map(t => {
            return this.createFile(t);
        });
        const isTypeScript = this.options.lang === 'ts';
        const assoc = this.createAssociations(isTypeScript);
        // get table names without schema
        // TODO: add schema to model and file names when schema is non-default for the dialect
        const tableNames = tables.map(t => {
            const [schemaName, tableName] = (0, types_1.qNameSplit)(t);
            return tableName;
        }).sort();
        // write the init-models file
        if (!this.options.noInitModels) {
            const initString = this.createInitString(tableNames, assoc, this.options.lang);
            const initFilePath = path_1.default.join(this.options.directory, "init-models" + (isTypeScript ? '.ts' : '.js'));
            const writeFile = util_1.default.promisify(fs_1.default.writeFile);
            const initPromise = writeFile(path_1.default.resolve(initFilePath), initString);
            promises.push(initPromise);
        }
        return Promise.all(promises);
    }
    createInitString(tableNames, assoc, lang) {
        switch (lang) {
            case 'ts':
                return this.createTsInitString(tableNames, assoc);
            case 'esm':
                return this.createESMInitString(tableNames, assoc);
            case 'es6':
                return this.createES5InitString(tableNames, assoc, "const");
            default:
                return this.createES5InitString(tableNames, assoc, "var");
        }
    }
    createFile(table) {
        // FIXME: schema is not used to write the file name and there could be collisions. For now it
        // is up to the developer to pick the right schema, and potentially chose different output
        // folders for each different schema.
        const [schemaName, tableName] = (0, types_1.qNameSplit)(table);
        const fileName = (0, types_1.recase)(this.options.caseFile, tableName, this.options.singularize);
        const filePath = path_1.default.join(this.options.directory, fileName + (this.options.lang === 'ts' ? '.ts' : '.js'));
        const writeFile = util_1.default.promisify(fs_1.default.writeFile);
        return writeFile(path_1.default.resolve(filePath), this.tableText[table]);
    }
    /** Create the belongsToMany/belongsTo/hasMany/hasOne association strings */
    createAssociations(typeScript) {
        let strBelongs = "";
        let strBelongsToMany = "";
        const sp = this.space[1];
        const rels = this.relations;
        const fKeys = this.foreignKeys;
        rels.forEach(rel => {
            const currentFk = fKeys[rel.childTable.split('.')[1]];
            const currentFkColumn = currentFk[rel.parentId];
            if (rel.isM2M) {
                const asprop = (0, types_1.recase)(this.options.caseProp, (0, types_1.pluralize)(rel.childProp));
                strBelongsToMany += `${sp}${rel.parentModel}.belongsToMany(${rel.childModel}, { as: '${asprop}', through: ${rel.joinModel}, foreignKey: "${rel.parentId}", otherKey: "${rel.childId}" });\n`;
            }
            else {
                // const bAlias = (this.options.noAlias && rel.parentModel.toLowerCase() === rel.parentProp.toLowerCase()) ? '' : `as: "${rel.parentProp}", `;
                const asParentProp = (0, types_1.recase)(this.options.caseProp, rel.parentProp);
                const bAlias = this.options.noAlias ? '' : `as: "${asParentProp}", `;
                strBelongs += `${sp}${rel.childModel}.belongsTo(${rel.parentModel}, { ${bAlias}foreignKey: "${rel.parentId}"});\n`;
                const hasRel = rel.isOne ? "hasOne" : "hasMany";
                // const hAlias = (this.options.noAlias && Utils.pluralize(rel.childModel.toLowerCase()) === rel.childProp.toLowerCase()) ? '' : `as: "${rel.childProp}", `;
                const asChildProp = (0, types_1.recase)(this.options.caseProp, rel.childProp);
                const hAlias = this.options.noAlias ? '' : `as: "${asChildProp}", `;
                const rules = [];
                if (currentFkColumn.rule_update) {
                    rules.push(`onUpdate: '${currentFkColumn.rule_update}'`);
                }
                if (currentFkColumn.rule_delete) {
                    rules.push(`onDelete: '${currentFkColumn.rule_delete}'`);
                }
                strBelongs += `${sp}${rel.parentModel}.${hasRel}(${rel.childModel}, { ${hAlias}foreignKey: "${rel.parentId}"${rules.length ? `, ${rules.join()}` : ''}});\n`;
            }
        });
        // belongsToMany must come first
        return strBelongsToMany + strBelongs;
    }
    // create the TypeScript init-models file to load all the models into Sequelize
    createTsInitString(tables, assoc) {
        let str = 'import type { Sequelize } from "sequelize";\n';
        const sp = this.space[1];
        const modelNames = [];
        // import statements
        tables.forEach(t => {
            const fileName = (0, types_1.recase)(this.options.caseFile, t, this.options.singularize);
            const modelName = (0, types_1.makeTableName)(this.options.caseModel, t, this.options.singularize, this.options.lang);
            modelNames.push(modelName);
            str += `import { ${modelName} as _${modelName} } from "./${fileName}";\n`;
            str += `import type { ${modelName}Attributes, ${modelName}CreationAttributes } from "./${fileName}";\n`;
        });
        // re-export the model classes
        str += '\nexport {\n';
        modelNames.forEach(m => {
            str += `${sp}_${m} as ${m},\n`;
        });
        str += '};\n';
        // re-export the model attirbutes
        str += '\nexport type {\n';
        modelNames.forEach(m => {
            str += `${sp}${m}Attributes,\n`;
            str += `${sp}${m}CreationAttributes,\n`;
        });
        str += '};\n\n';
        // create the initialization function
        str += 'export function initModels(sequelize: Sequelize) {\n';
        modelNames.forEach(m => {
            str += `${sp}const ${m} = _${m}.initModel(sequelize);\n`;
        });
        // add the asociations
        str += "\n" + assoc;
        // return the models
        str += `\n${sp}return {\n`;
        modelNames.forEach(m => {
            str += `${this.space[2]}${m}: ${m},\n`;
        });
        str += `${sp}};\n`;
        str += '}\n';
        return str;
    }
    // create the ES5 init-models file to load all the models into Sequelize
    createES5InitString(tables, assoc, vardef) {
        let str = `${vardef} DataTypes = require("sequelize").DataTypes;\n`;
        const sp = this.space[1];
        const modelNames = [];
        // import statements
        tables.forEach(t => {
            const fileName = (0, types_1.recase)(this.options.caseFile, t, this.options.singularize);
            const modelName = (0, types_1.makeTableName)(this.options.caseModel, t, this.options.singularize, this.options.lang);
            modelNames.push(modelName);
            str += `${vardef} _${modelName} = require("./${fileName}");\n`;
        });
        // create the initialization function
        str += '\nfunction initModels(sequelize) {\n';
        modelNames.forEach(m => {
            str += `${sp}${vardef} ${m} = _${m}(sequelize, DataTypes);\n`;
        });
        // add the asociations
        str += "\n" + assoc;
        // return the models
        str += `\n${sp}return {\n`;
        modelNames.forEach(m => {
            str += `${this.space[2]}${m},\n`;
        });
        str += `${sp}};\n`;
        str += '}\n';
        str += 'module.exports = initModels;\n';
        str += 'module.exports.initModels = initModels;\n';
        str += 'module.exports.default = initModels;\n';
        return str;
    }
    // create the ESM init-models file to load all the models into Sequelize
    createESMInitString(tables, assoc) {
        let str = 'import _sequelize from "sequelize";\n';
        str += 'const DataTypes = _sequelize.DataTypes;\n';
        const sp = this.space[1];
        const modelNames = [];
        // import statements
        tables.forEach(t => {
            const fileName = (0, types_1.recase)(this.options.caseFile, t, this.options.singularize);
            const modelName = (0, types_1.makeTableName)(this.options.caseModel, t, this.options.singularize, this.options.lang);
            modelNames.push(modelName);
            str += `import _${modelName} from  "./${fileName}.js";\n`;
        });
        // create the initialization function
        str += '\nexport default function initModels(sequelize) {\n';
        modelNames.forEach(m => {
            str += `${sp}const ${m} = _${m}.init(sequelize, DataTypes);\n`;
        });
        // add the associations
        str += "\n" + assoc;
        // return the models
        str += `\n${sp}return {\n`;
        modelNames.forEach(m => {
            str += `${this.space[2]}${m},\n`;
        });
        str += `${sp}};\n`;
        str += '}\n';
        return str;
    }
}
exports.AutoWriter = AutoWriter;
//# sourceMappingURL=auto-writer.js.map