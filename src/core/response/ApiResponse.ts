import { Response } from "express";

export class ApiResponse {
    static success<T>(
        res: Response,
        data: T,
        message = "Success",
        statusCode = 200
    ): Response {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
        });
    }

    static created<T>(res: Response, data: T, message = "Created"): Response {
        return ApiResponse.success(res, data, message, 201);
    }

    static noContent(res: Response): Response {
        return res.status(204).send();
    }
}
