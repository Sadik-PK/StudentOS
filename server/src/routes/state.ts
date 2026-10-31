import { Router } from "express"

import { requireAuth } from "../middleware/requireAuth.js"

import { appStateSchema, stateWriteSchema } from "../schemas/state.js"

import {
  loadUserState,
  saveUserState,
  StateConflictError,
  StateValidationError,
} from "../services/stateService.js"

export const stateRouter = Router()

stateRouter.use(requireAuth)

stateRouter.get("/", async (req, res, next) => {
  try {
    res.json(await loadUserState(req.userId!))
  } catch (error) {
    next(error)
  }
})

stateRouter.put("/", async (req, res, next) => {
  const parsed = stateWriteSchema.safeParse(req.body)

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid state payload.", details: parsed.error.issues })

    return
  }

  try {
    const revision = await saveUserState(
      req.userId!,
      parsed.data.state,
      parsed.data.revision,
    )

    res.json({ revision, lastSyncedAt: new Date().toISOString() })
  } catch (error) {
    if (error instanceof StateConflictError) {
      res.status(409).json({ error: error.message })

      return
    }
    if (error instanceof StateValidationError) {
      res.status(400).json({ error: error.message })

      return
    }

    next(error)
  }
})

stateRouter.post("/migrate", async (req, res, next) => {
  const parsed = appStateSchema.safeParse(req.body?.state)

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid legacy data.", details: parsed.error.issues })

    return
  }

  try {
    const existing = await loadUserState(req.userId!)

    if (existing.legacyMigrated) {
      res.json({
        state: existing.state,

        revision: existing.revision,

        lastSyncedAt: existing.lastSyncedAt,

        alreadyMigrated: true,
      })

      return
    }

    if (existing.state) {
      res
        .status(409)
        .json({
          error:
            "Cloud data already exists. Legacy data was not allowed to overwrite it.",
        })

      return
    }

    const revision = await saveUserState(
      req.userId!,
      parsed.data,
      existing.revision,
      true,
    )

    res
      .status(201)
      .json({
        revision,
        lastSyncedAt: new Date().toISOString(),
        alreadyMigrated: false,
      })
  } catch (error) {
    if (error instanceof StateConflictError) {
      res.status(409).json({ error: error.message })

      return
    }
    if (error instanceof StateValidationError) {
      res.status(400).json({ error: error.message })

      return
    }

    next(error)
  }
})
