import { Router, Request, Response } from "express";
import { Op, WhereOptions } from "sequelize";
import { CleanUpHousehold } from "../models/CleanUpHousehold";
import multer from "multer";
import fs from "fs";
import path from "path";
import { sequelize } from "../db/sequelize";

const router = Router();

const uploadDir = path.resolve(process.cwd(), "uploads", "households");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const householdId = req.params.id ?? "unknown";
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeField = (file.fieldname || "image").replace(/[^a-zA-Z0-9_-]/g, "");
    cb(null, `household_${householdId}_${safeField}_${Date.now()}${ext}`);
  },
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("이미지 파일만 업로드할 수 있습니다."));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 4,
    fileSize: 10 * 1024 * 1024,
  },
});

const photoUpload = upload.fields([
  { name: "addressImage", maxCount: 1 },
  { name: "beforeImage", maxCount: 1 },
  { name: "duringImage", maxCount: 1 },
  { name: "afterImage", maxCount: 1 },
]);

function toPublicPath(file?: Express.Multer.File) {
  if (!file) return null;
  return `/uploads/households/${file.filename}`;
}

function deleteOldFile(filePath?: string | null) {
  if (!filePath) return;

  const normalized = filePath.replace(/^\/+/, "");
  const absolute = path.resolve(process.cwd(), normalized);

  if (fs.existsSync(absolute)) {
    try {
      fs.unlinkSync(absolute);
    } catch (err) {
      console.error("기존 파일 삭제 실패:", absolute, err);
    }
  }
}

/**
 * GET /households/list
 */
router.get("/list", async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      q = "", 
      sort = "localNo", 
      order = "asc",
      isArchived,
      isComplete // 프론트에서 보낼 작업완료 여부
    } = req.query;

    const where: any = {};

    // 탭 구분을 위한 로직
    if (isComplete === "true") {
      where.isComplete = true;
    } else if (isArchived === "true") {
      where.isArchived = true;
      where.isComplete = false; // 동선에는 아직 완료 안 된 것만 표시
    } else {
      where.isArchived = false;
      where.isComplete = false; // 일반 목록
    }

    if (q) {
      where.name = { [Op.like]: `%${q}%` };
    }

    const { rows, count } = await CleanUpHousehold.findAndCountAll({
      where,
      limit: Number(pageSize),
      offset: (Number(page) - 1) * Number(pageSize),
      // 보관함이나 완료 목록은 최신순 혹은 지정 순서(routeOrder)로 정렬
      order: isComplete === "true" 
        ? [['updatedAt', 'DESC']] 
        : (isArchived === "true" ? [['routeOrder', 'ASC']] : [[String(sort), String(order).toUpperCase()]]),
    });

    return res.json({
      items: rows,
      pagination: {
        page: Number(page),
        total: count,
        totalPages: Math.ceil(count / Number(pageSize)),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "서버 오류" });
  }
});

/**
 * PUT /households/:id/photos
 * form-data:
 * - addressImage: 1장
 * - beforeImage: 1장
 * - duringImage: 1장
 * - afterImage: 1장
 */
router.put("/:id/photos", (req: Request, res: Response) => {
  console.log("사진 업로드 요청 도착:", req.method, req.originalUrl);

  photoUpload(req, res, async (uploadErr: any) => {
    try {
      if (uploadErr) {
        console.error("multer 업로드 에러:", uploadErr);
        return res.status(400).json({
          message: "photo upload failed",
          error: uploadErr?.message ?? String(uploadErr),
        });
      }

      console.log("req.files:", req.files);

      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "invalid id" });
      }

      const item = await CleanUpHousehold.findByPk(id);

      if (!item) {
        return res.status(404).json({ message: "household not found" });
      }

      const files = req.files as
        | {
            [fieldname: string]: Express.Multer.File[];
          }
        | undefined;

      const addressImageFile = files?.addressImage?.[0];
      const beforeImageFile = files?.beforeImage?.[0];
      const duringImageFile = files?.duringImage?.[0];
      const afterImageFile = files?.afterImage?.[0];

      if (!addressImageFile && !beforeImageFile && !duringImageFile && !afterImageFile) {
        return res.status(400).json({
          message: "at least one image is required",
        });
      }

      if (addressImageFile && item.addressImage) deleteOldFile(item.addressImage);
      if (beforeImageFile && item.beforeImage) deleteOldFile(item.beforeImage);
      if (duringImageFile && item.duringImage) deleteOldFile(item.duringImage);
      if (afterImageFile && item.afterImage) deleteOldFile(item.afterImage);

      if (addressImageFile) item.addressImage = toPublicPath(addressImageFile);
      if (beforeImageFile) item.beforeImage = toPublicPath(beforeImageFile);
      if (duringImageFile) item.duringImage = toPublicPath(duringImageFile);
      if (afterImageFile) item.afterImage = toPublicPath(afterImageFile);

      await item.save();

      return res.json({
        message: "photos uploaded successfully",
        item: {
          id: item.id,
          photos: {
            addressImage: item.addressImage,
            beforeImage: item.beforeImage,
            duringImage: item.duringImage,
            afterImage: item.afterImage,
          },
        },
      });
    } catch (err: any) {
      console.error("사진 업로드 내부 에러:", err);
      return res.status(500).json({
        message: "failed to upload photos",
        error: err?.message ?? String(err),
      });
    }
  });
});

/**
 * GET /households/:id
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "invalid id",
      });
    }

    const item = await CleanUpHousehold.findByPk(id, {
      attributes: [
        "id",
        "programYear",
        "listType",
        "localNo",
        "categoryCode",
        "dong",
        "benefitType",
        "name",
        "rrn",
        "phone",
        "proxyPhone",
        "roadAddress",
        "detailAddress",
        "rank",
        "totalScore",
        "scoreHouseholdSize",
        "scoreAge",
        "scoreDisability",
        "scoreResidencePeriod",
        "scoreBenefitType",
        "scoreOther",
        "otherReason",
        "remark",
        "addressImage",
        "beforeImage",
        "duringImage",
        "afterImage",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!item) {
      return res.status(404).json({
        message: "household not found",
      });
    }

    return res.json({
      item: {
        id: item.id,
        programYear: item.programYear,
        listType: item.listType,
        localNo: item.localNo,
        categoryCode: item.categoryCode,
        dong: item.dong,
        benefitType: item.benefitType,
        name: item.name,
        rrn: item.rrn,
        phone: item.phone,
        proxyPhone: item.proxyPhone,
        roadAddress: item.roadAddress,
        detailAddress: item.detailAddress,
        rank: item.rank,
        totalScore: item.totalScore,
        scoreHouseholdSize: item.scoreHouseholdSize,
        scoreAge: item.scoreAge,
        scoreDisability: item.scoreDisability,
        scoreResidencePeriod: item.scoreResidencePeriod,
        scoreBenefitType: item.scoreBenefitType,
        scoreOther: item.scoreOther,
        otherReason: item.otherReason,
        remark: item.remark,
        photos: {
          addressImage: item.addressImage,
          beforeImage: item.beforeImage,
          duringImage: item.duringImage,
          afterImage: item.afterImage,
        },
      },
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      message: "failed to fetch household detail",
      error: err?.message ?? String(err),
    });
  }
});
/**
 * 가구 보관함 이동 API
 * PATCH /api/households/:id/archive
 */
router.patch("/:id/archive", async (req: Request, res: Response) => {
  const tx = await sequelize.transaction(); // 순서 일관성을 위해 트랜잭션 시작
  try {
    const { id } = req.params;
    const {is_complete} = req.body;

    const household = await CleanUpHousehold.findByPk(id);

    if (!household) {
      await tx.rollback();
      return res.status(404).json({ ok: false, message: "해당 데이터를 찾을 수 없습니다." });
    }

    const wasArchived = household.isArchived;
    const currentOrder = household.routeOrder;
    console.log(is_complete);

    if (wasArchived) {
      // [CASE 1: 보관함 해제]
      // 1. 현재 항목 해제 (isArchived: false, routeOrder: 0)
      await household.update({ isArchived: false, routeOrder: 0,isComplete:is_complete??false }, { transaction: tx });

      // 2. 빠진 번호 뒤의 항목들 순서를 하나씩 당김 (routeOrder = routeOrder - 1)
      await CleanUpHousehold.update(
        { routeOrder: sequelize.literal("route_order - 1") },
        {
          where: {
            isArchived: true,
            routeOrder: { [Op.gt]: currentOrder }, // 나보다 순서가 컸던 항목들만
          },
          transaction: tx,
        }
      );
    } else {
      // [CASE 2: 보관함 추가]
      // 1. 현재 보관함의 마지막 순번 확인
      const maxOrder = await CleanUpHousehold.max("routeOrder", {
        where: { isArchived: true },
      });

      // 2. 마지막 순번 + 1로 추가
      await household.update(
        { isArchived: true, routeOrder: (Number(maxOrder) || 0) + 1 },
        { transaction: tx }
      );
    }

    await tx.commit();

    return res.status(200).json({
      ok: true,
      message: wasArchived ? "보관함에서 제거되었습니다." : "보관함으로 이동되었습니다.",
      id: household.id,
    });
  } catch (error) {
    if (tx) await tx.rollback();
    console.error(error);
    return res.status(500).json({ ok: false, message: "서버 오류가 발생했습니다." });
  }
});

/**
 * 보관함 내 동선 순서 변경 API (Swap 방식)
 * PATCH /api/households/reorder
 */
router.patch("/reorder", async (req: Request, res: Response) => {
  const tx = await sequelize.transaction();
  try {
    const { dragId, dropId } = req.body; // 바꿀 두 아이템의 ID
    console.log(req.body);

    const itemA = await CleanUpHousehold.findByPk(dragId);
    const itemB = await CleanUpHousehold.findByPk(dropId);

    if (!itemA || !itemB) {
      return res.status(404).json({ ok: false, message: "항목을 찾을 수 없습니다." });
    }

    // 두 항목의 routeOrder 값을 서로 바꿈
    const tempOrder = itemA.routeOrder;
    itemA.routeOrder = itemB.routeOrder;
    itemB.routeOrder = tempOrder;

    await itemA.save({ transaction: tx });
    await itemB.save({ transaction: tx });

    await tx.commit();
    return res.json({ ok: true, message: "순서가 변경되었습니다." });
  } catch (err) {
    await tx.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, message: "순서 변경 중 오류 발생" });
  }
});
export default router;