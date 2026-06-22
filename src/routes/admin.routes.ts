import { Router } from "express";
import * as users from "../controllers/user.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { ROLES } from "../constants/roles";
import { asyncHandler } from "../middlewares/errorHandler";

const router = Router();

// Todo o painel administrativo exige autenticacao + papel ADMINISTRADOR.
router.use(authenticate, authorize(ROLES.ADMINISTRADOR));

router.get("/dashboard", asyncHandler(users.adminDashboard));
router.get("/users", asyncHandler(users.listUsers));
router.patch("/users/:id/role", asyncHandler(users.changeUserRole));

export default router;
