import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { Qna } from "../models/QnA";

// ===== 비밀번호 해시 유틸(SHA-256 + salt) =====
function makeSalt(len = 16) {
  return crypto.randomBytes(len).toString("hex");
}
function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
/** 저장 포맷: "salt:hash" */
function hashPassword(pw: string) {
  const salt = makeSalt();
  const hash = sha256(`${salt}:${pw}`);
  return `${salt}:${hash}`;
}
function verifyPassword(stored: string | null | undefined, pw: string) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return sha256(`${salt}:${pw}`) === hash;
}

function toSafeRow(row: any) {
  const json = row.toJSON ? row.toJSON() : row;
  delete json.passwordHash;
  return json;
}

// =============================
// 1) 목록 GET /qna
// =============================
export async function listQna(req: Request, res: Response, next: NextFunction) {
  try {
    const q = String(req.query.q ?? "").trim();
    const category = String(req.query.category ?? "").trim();
    const answered = req.query.answered;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 10)));

    const { Op } = require("sequelize");
    const where: any = {};

    if (category) where.category = category;
    if (answered === "true") where.answered = true;
    if (answered === "false") where.answered = false;

    if (q) {
      where[Op.or] = [
        { question: { [Op.like]: `%${q}%` } },
        { category: { [Op.like]: `%${q}%` } },
      ];
    }

    const offset = (page - 1) * pageSize;

    const { rows, count } = await Qna.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit: pageSize,
      attributes: { exclude: ["passwordHash", "answer"] },
    });

    res.json({
      page,
      pageSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
      items: rows.map(toSafeRow),
    });
  } catch (e) {
    next(e);
  }
}

// =============================
// 2) 등록 POST /qna
// =============================
export async function createQna(req: Request, res: Response, next: NextFunction) {
  try {
    if(req.body.captchaVerified){
        const category = String(req.body.category ?? "기타").trim() || "기타";
    const question = String(req.body.question ?? "").trim();
    const answer = req.body.answer == null ? null : String(req.body.answer);
    const isSecret = Boolean(req.body.isSecret);
    const password = String(req.body.password ?? "").trim();

    if (!question) return res.status(400).json({ message: "question은 필수입니다." });
    if (isSecret && !password) {
      return res.status(400).json({ message: "비밀글은 비밀번호가 필요합니다." });
    }

    const answered = !!(answer && String(answer).trim());
    const passwordHash = isSecret ? hashPassword(password) : null;

    const created = await Qna.create({
      category,
      question,
      answer,
      isSecret,
      passwordHash,
      answered,
      views: 0,
      captchaVerifiedAt: null,
    });

    res.status(201).json({ item: toSafeRow(created) });
    }else{
        res.status(401).json({error:'자동방지번호 누락'});
    }
    
  } catch (e) {
    next(e);
  }
}

// =============================
// 3) 상세 GET /qna/:id
// - ✅ 관리자(토큰): 비번 없이 열람
// - ✅ 게스트: 비밀글이면 비번 필요
// =============================
export async function readQna(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const row = await Qna.findByPk(id);
    if (!row) return res.status(404).json({ message: "not found" });

    const isAdmin = (req as any)?.user?.role === "admin";

    if (row.isSecret && !isAdmin) {
      const pw =
        String(req.header("x-qna-password") ?? "").trim() ||
        String(req.query.password ?? "").trim();

      if (!pw) return res.status(401).json({ message: "비밀번호가 필요합니다." });
      if (!verifyPassword(row.passwordHash, pw)) {
        return res.status(403).json({ message: "비밀번호가 일치하지 않습니다." });
      }
    }

    await row.increment("views", { by: 1 });
    res.json(toSafeRow(row));
  } catch (e) {
    next(e);
  }
}

// =============================
// 4) 수정 PUT /qna/:id (관리자 전용 라우트로 잠금)
// =============================
export async function updateQna(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const row = await Qna.findByPk(id);
    if (!row) return res.status(404).json({ message: "not found" });

    const password = String(req.body.password ?? "").trim();
    const newPassword = String(req.body.newPassword ?? "").trim();

    const isAdmin = (req as any)?.user?.role === "admin";

    // ✅ 기존이 비밀글이면 검증(관리자면 예외)
    if (row.isSecret && !isAdmin && req.body.answer === '') {
       
      if (!password) return res.status(401).json({ message: "비밀번호가 필요합니다." });
      if (!verifyPassword(row.passwordHash, password)) {
        return res.status(403).json({ message: "비밀번호가 일치하지 않습니다." });
      }
    }

    const patch: any = {};
    if (req.body.category !== undefined) {
      patch.category = String(req.body.category ?? "기타").trim() || "기타";
    }
    if (req.body.question !== undefined) {
      const q = String(req.body.question ?? "").trim();
      if (!q) return res.status(400).json({ message: "question은 비어있을 수 없습니다." });
      patch.question = q;
    }
    if (req.body.answer !== undefined) {
      patch.answer = req.body.answer == null ? null : String(req.body.answer);
      patch.answered = !!(patch.answer && String(patch.answer).trim());
    }

    if (req.body.isSecret !== undefined) {
      const targetSecret = Boolean(req.body.isSecret);

      if (!row.isSecret && targetSecret) {
        if (!newPassword) {
          return res.status(400).json({ message: "비밀글로 전환 시 newPassword가 필요합니다." });
        }
        patch.isSecret = true;
        patch.passwordHash = hashPassword(newPassword);
      }

      if (row.isSecret && !targetSecret) {
        patch.isSecret = false;
        patch.passwordHash = null;
      }
    }

    if (row.isSecret && newPassword) {
      patch.passwordHash = hashPassword(newPassword);
    }

    await row.update(patch);
    res.json({ item: toSafeRow(row) });
  } catch (e) {
    next(e);
  }
}

// =============================
// 5) 삭제 DELETE /qna/:id (관리자 전용 라우트로 잠금)
// =============================
export async function deleteQna(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const row = await Qna.findByPk(id);
    if (!row) return res.status(404).json({ message: "not found" });

    const password = String(req.body.password ?? "").trim();
    const isAdmin = (req as any)?.user?.role === "admin";

    // if (row.isSecret && !isAdmin) {
    //   if (!password) return res.status(401).json({ message: "비밀번호가 필요합니다." });
    //   if (!verifyPassword(row.passwordHash, password)) {
    //     return res.status(403).json({ message: "비밀번호가 일치하지 않습니다." });
    //   }
    // }

    await row.destroy();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function verifyQnaPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const row = await Qna.findByPk(id);
    if (!row) return res.status(404).json({ message: "not found" });

    const isAdmin = (req as any)?.user?.role === "admin";
    if (isAdmin) return res.json({ ok: true, admin: true });

    const pw = String(req.body?.password ?? "").trim();
    if (!pw) return res.status(401).json({ message: "비밀번호가 필요합니다." });

    // ✅ 공개글/비밀글 모두 수정/삭제용 비번 검증
    if (!verifyPassword(row.passwordHash, pw)) {
      return res.status(403).json({ message: "비밀번호가 일치하지 않습니다." });
    }

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
