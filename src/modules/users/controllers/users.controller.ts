import {Request, Response} from "express";

export class UsersController {
    static async me(req: Request, res: Response) {
        return res.json({
            user: req.user,
        });
    }

    static async superAdminData(
        req: Request,
        res: Response
    ) {
        return res.json({
            message: "ONLY SUPER ADMIN",
        });
    }
}