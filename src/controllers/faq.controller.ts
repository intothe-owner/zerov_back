import { Request, Response, NextFunction } from "express";
import { Faq } from "../models/Faq";
import { sequelize } from "../db/sequelize";

export async function listFaqs(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await Faq.findAll({
      order: [
        ["sortOrder", "ASC"],
        ["id", "ASC"],
      ],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createFaq(req: Request, res: Response, next: NextFunction) {
  try {
    const title = String(req.body?.title ?? "").trim();
    const content = String(req.body?.content ?? "").trim();
    if (!title) return res.status(400).json({ message: "제목은 필수입니다." });
    if (!content) return res.status(400).json({ message: "내용은 필수입니다." });

    // 마지막 sortOrder + 1
    const max = await Faq.max("sortOrder");
    const sortOrder = Number.isFinite(max as any) ? Number(max) + 1 : 1;

    const row = await Faq.create({ title, content, sortOrder });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteFaq(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const row = await Faq.findByPk(id);
    if (!row) return res.status(404).json({ message: "not found" });

    await row.destroy();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

/**
 * body: { ids: number[] }  // 위에서 아래 순서대로
 */
export async function reorderFaqs(req: Request, res: Response, next: NextFunction) {
  const t = await sequelize.transaction();
  try {
    const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
    if (ids.length < 1) {
      await t.rollback();
      return res.status(400).json({ message: "ids가 필요합니다." });
    }

    // 순서 저장
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!Number.isFinite(id)) continue;
      await Faq.update({ sortOrder: i + 1 }, { where: { id }, transaction: t });
    }

    await t.commit();
    res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    next(e);
  }
}
