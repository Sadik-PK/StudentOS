import type { NextFunction, Request, Response } from "express"

import { fromNodeHeaders } from "better-auth/node"

import { auth } from "../auth.js"

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })

    if (!session) {
      res.status(401).json({ error: "Authentication required." })

      return
    }

    req.userId = session.user.id

    next()
  } catch (error) {
    next(error)
  }
}
