import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

export type JwtPayload = {
  sub: string;
  adminId: string;
  role: "admin";
  name?: string;
};

export function authJwt(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ message: "No token" });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ message: "JWT secret not configured" });

  try {
    const payload = jwt.verify(token, secret as jwt.Secret) as JwtPayload;
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
