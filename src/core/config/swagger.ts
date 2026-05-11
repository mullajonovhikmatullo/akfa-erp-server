import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
    definition: {
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",

                    scheme: "bearer",

                    bearerFormat: "JWT",
                },
            },
        },
        openapi: "3.0.0",

        info: {
            title: "Retail ERP API",

            version: "1.0.0",

            description:
                "Multi-branch retail management system API",
        },

        servers: [
            {
                url: "http://localhost:3000",
            },
        ],
    },

    apis: ["./src/modules/**/*.ts"],
});