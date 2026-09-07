"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationSchema = exports.listWindowSchema = exports.MAX_LIST_LIMIT = exports.DEFAULT_LIST_LIMIT = void 0;
exports.queryInteger = queryInteger;
const zod_1 = require("zod");
// Keep existing array responses; callers can traverse them with limit/offset.
exports.DEFAULT_LIST_LIMIT = 100;
exports.MAX_LIST_LIMIT = 500;
function queryInteger(fallback, maximum, minimum = 1) {
    return zod_1.z.string().regex(/^\d+$/, "Must be an integer")
        .transform(Number)
        .pipe(zod_1.z.number().int().min(minimum).max(maximum))
        .optional().transform((value) => value ?? fallback);
}
exports.listWindowSchema = zod_1.z.object({
    limit: queryInteger(exports.DEFAULT_LIST_LIMIT, exports.MAX_LIST_LIMIT),
    offset: queryInteger(0, 1000000, 0),
});
exports.paginationSchema = zod_1.z.object({
    page: queryInteger(1, 1000000),
    pageSize: queryInteger(10, 100),
});
