"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
class UsersController {
    static async me(req, res) {
        return res.json({
            user: req.user,
        });
    }
}
exports.UsersController = UsersController;
