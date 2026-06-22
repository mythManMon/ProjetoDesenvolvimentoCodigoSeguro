import { Router } from "express";
import * as comments from "../controllers/comment.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { ROLES } from "../constants/roles";
import { asyncHandler } from "../middlewares/errorHandler";

// Montado em /events/:eventId/comments (mergeParams para herdar :eventId).
export const eventCommentsRouter = Router({ mergeParams: true });

eventCommentsRouter.get(
  "/",
  authenticate,
  asyncHandler(comments.listComments)
); // autenticado (mod/admin veem ocultos)
eventCommentsRouter.post(
  "/",
  authenticate,
  asyncHandler(comments.createComment)
); // autenticado

// Montado em /comments (acoes de moderacao sobre um comentario).
export const commentsRouter = Router();

commentsRouter.patch(
  "/:id/hide",
  authenticate,
  authorize(ROLES.MODERADOR, ROLES.ADMINISTRADOR),
  asyncHandler(comments.hideComment)
);
commentsRouter.delete(
  "/:id",
  authenticate,
  authorize(ROLES.MODERADOR, ROLES.ADMINISTRADOR),
  asyncHandler(comments.deleteComment)
);
