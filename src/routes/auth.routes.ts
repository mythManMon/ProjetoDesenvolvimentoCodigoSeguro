import { Router } from "express";
import * as auth from "../controllers/auth.controller";
import { authenticate } from "../middlewares/authenticate";
import { asyncHandler } from "../middlewares/errorHandler";

const router = Router();

// Rotas publicas
router.post("/register", asyncHandler(auth.register));
router.post("/login", asyncHandler(auth.login));
router.post("/refresh", asyncHandler(auth.refresh));
router.post("/logout", asyncHandler(auth.logout));

// Rota protegida (exige access token valido)
router.get("/me", authenticate, asyncHandler(auth.me));

export default router;
