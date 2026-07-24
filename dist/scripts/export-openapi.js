"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const swagger_1 = require("../core/config/swagger");
const outputPath = (0, path_1.resolve)(process.cwd(), "openapi.json");
(0, fs_1.writeFileSync)(outputPath, `${JSON.stringify(swagger_1.swaggerSpec, null, 2)}\n`);
console.log(`OpenAPI contract written to ${outputPath}`);
