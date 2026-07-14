"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
class UsersController {
    static async me(req, res) {
        return res.json({
            user: req.user,
        });
    }
    static async superAdminData(req, res) {
        return res.json({
            message: "ONLY SUPER ADMIN",
        });
    }
}
exports.UsersController = UsersController;
