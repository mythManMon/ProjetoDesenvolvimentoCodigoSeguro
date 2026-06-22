import { Router } from "express";
import * as polls from "../controllers/poll.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { ROLES } from "../constants/roles";
import { asyncHandler } from "../middlewares/errorHandler";

// Montado em /events/:eventId/polls (mergeParams para herdar :eventId).
export const eventPollsRouter = Router({ mergeParams: true });

eventPollsRouter.get("/", asyncHandler(polls.listPolls)); // publico
eventPollsRouter.post(
  "/",
  authenticate,
  authorize(ROLES.MODERADOR, ROLES.ADMINISTRADOR),
  asyncHandler(polls.createPoll)
);

// Montado em /polls (acoes sobre uma enquete especifica).
export const pollsRouter = Router();

pollsRouter.get("/:id/results", asyncHandler(polls.pollResults)); // publico
pollsRouter.post("/:id/vote", authenticate, asyncHandler(polls.vote)); // autenticado
pollsRouter.patch(
  "/:id/status",
  authenticate,
  authorize(ROLES.MODERADOR, ROLES.ADMINISTRADOR),
  asyncHandler(polls.setPollStatus)
);
