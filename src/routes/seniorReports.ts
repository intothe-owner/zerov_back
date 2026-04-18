import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SeniorCenterCleanUp, SeniorCenterReport } from "../models";
import { createSeniorCenterReportPdfBuffer } from "../services/createSeniorCenterReportPdf";
import { encodeRFC5987ValueChars } from "../utils/fileName";
const router = Router();

// S3 설정
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Multer 설정 (메모리 스토리지 사용)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 제한
});

/**
 * 경로당 상세 보고서 사진 업로드 API
 * PUT /api/senior-centers/:centerId/reports/:category/photos
 */
router.put(
  "/:centerId/reports/:category/photos",
  upload.single("file"),
  async (req: Request, res: Response) => {
    console.log('업로드 중');
    try {
      const { centerId, category } = req.params;
      const { fieldName } = req.body; // entranceImage, workImage1 등
      const file = req.file;

      if (!file) {
        return res.status(400).json({ ok: false, message: "업로드할 파일이 없습니다." });
      }

      if (!fieldName) {
        return res.status(400).json({ ok: false, message: "필드명(fieldName)이 누락되었습니다." });
      }

      // 1. 해당 경로당의 카테고리별 보고서 레코드가 있는지 확인 (없으면 생성)
      let report = await SeniorCenterReport.findOne({
        where: { centerId: Number(centerId), category }
      });

      if (!report) {
        report = await SeniorCenterReport.create({
          centerId: Number(centerId),
          category: category as any,
          isComplete: false
        });
      }

      // 2. S3 업로드 설정
      const fileExtension = file.originalname.split(".").pop();
      const s3Key = `senior-reports/${centerId}/${category}/${crypto.randomUUID()}.${fileExtension}`;

      const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      // 3. S3에 파일 전송
      await s3.send(new PutObjectCommand(uploadParams));
      const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

      // 4. 데이터베이스 업데이트 (전달받은 fieldName 컬럼에 URL 저장)
      // 예: entranceImage, beforeImage1 등
      await report.update({
        [fieldName]: imageUrl
      });

      return res.status(200).json({
        ok: true,
        message: "사진이 성공적으로 업로드되었습니다.",
        data: {
            fieldName,
            imageUrl
        }
      });

    } catch (error) {
      console.error("Report Photo Upload Error:", error);
      return res.status(500).json({ ok: false, message: "서버 오류가 발생했습니다." });
    }
  }
);
/**
 * 경로당 PDF 보고서 생성 및 다운로드
 * GET /api/senior-centers/:id/reports/:category/pdf
 */
router.get("/:id/reports/:category/pdf", async (req: Request, res: Response) => {
  try {
    const { id, category } = req.params;

    // 1. 데이터 조회
    const center = await SeniorCenterCleanUp.findByPk(id);
    const report = await SeniorCenterReport.findOne({
      where: { centerId: id, category: category }
    });
    console.log(req.query);
    const organization = (req.query.org as string) || "기관명 없음";

    if (!center || !report) {
        return res.status(404).json({ ok: false, message: "보고서 데이터를 찾을 수 없습니다." });
    }
    const formattedWorkDate = report.workDate 
        ? new Date(report.workDate as any).toISOString().split('T')[0].replace(/-/g, '.')
        : "-";
    // 2. PDF 파라미터 구성
    const pdfParams = {
      title: `${category === "AIR_CONDITIONER" ? "에어컨" : "공기청정기"} 세척 작업보고서`,
      centerName: center.name,
      agencyName: organization,
      companyName: "(주)제로브이",
      companyAddress: "부산광역시 해운대구 신반송로 151, 106호",
      companyPhone: "051-545-1150",
      ceoName: "김남관",
      workDate: formattedWorkDate, // ✅ 이제 string 타입이므로 에러가 발생하지 않습니다.
      workerName: "작업자",
      address: center.roadAddress,
      photos: {
        entranceImage: report.entranceImage,
        workImage1: report.workImage1,
        workImage2: report.workImage2,
        beforeImage1: report.beforeImage1,
        afterImage1: report.afterImage1,
        beforeImage2: report.beforeImage2,
        afterImage2: report.afterImage2,
      }
    };

    // 3. PDF 버퍼 생성
    const pdfBuffer = await createSeniorCenterReportPdfBuffer(pdfParams);

    // 4. 파일명 설정 및 전송
    const fileName = `${center.name}_${category}_작업보고서.pdf`;
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeRFC5987ValueChars(fileName)}"`
    );

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF 생성 에러:", error);
    return res.status(500).json({ ok: false, message: "PDF 생성 중 서버 오류가 발생했습니다." });
  }
});
export default router;