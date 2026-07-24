import { writeFileSync } from "fs";
import { resolve } from "path";
import { swaggerSpec } from "../core/config/swagger";

const outputPath = resolve(process.cwd(), "openapi.json");

writeFileSync(outputPath, `${JSON.stringify(swaggerSpec, null, 2)}\n`);
console.log(`OpenAPI contract written to ${outputPath}`);
