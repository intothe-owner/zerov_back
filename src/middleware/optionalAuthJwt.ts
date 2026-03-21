import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

export type JwtPayload = {
  sub: string;
  adminId: string;
  role: "admin";
  name?: string;
};

/**
 * ✅ 선택적 JWT 인증
 * - Authorization 헤더가 없으면 그대로 통과
 * - 토큰이 있으면 검증 후 (req as any).user 에 payload 주입
 * - 토큰이 있는데 유효하지 않으면 401
 */
export function optionalAuthJwt(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return next();

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ message: "JWT secret not configured" });

  try {
    const payload = jwt.verify(token, secret as jwt.Secret) as JwtPayload;
    (req as any).user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
