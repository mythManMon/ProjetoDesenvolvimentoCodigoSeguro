import { Router } from "express";
import * as events from "../controllers/event.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { ROLES } from "../constants/roles";
import { asyncHandler } from "../middlewares/errorHandler";
import { eventPollsRouter } from "./poll.routes";
import { eventCommentsRouter } from "./comment.routes";

const router = Router();

// Publicas
router.get("/", asyncHandler(events.listEvents));
router.get("/:id", asyncHandler(events.getEvent));

// Restritas ao ADMINISTRADOR (gerenciamento de eventos)
router.post(
  "/",
  authenticate,
  authorize(ROLES.ADMINISTRADOR),
  asyncHandler(events.createEvent)
);
router.patch(
  "/:id",
  authenticate,
  authorize(ROLES.ADMINISTRADOR),
  asyncHandler(events.updateEvent)
);
router.delete(
  "/:id",
  authenticate,
  authorize(ROLES.ADMINISTRADOR),
  asyncHandler(events.deleteEvent)
);

// Sub-recursos aninhados
router.use("/:eventId/polls", eventPollsRouter);
router.use("/:eventId/comments", eventCommentsRouter);

export default router;
