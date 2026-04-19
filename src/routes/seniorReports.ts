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
    
    
    // 이전에 발생했던 타입 에러 방지용 (as string 처리)
    const organization = (req.query.org as string) || "기관명 없음";

    // ✅ 추가 1: 프론트엔드에서 보낸 workName 파라미터 받기
    const inputWorkName = req.query.workName as string;
    
    // ✅ 수정 1: report가 없어도 에러를 띄우지 않고 통과하도록 변경
    if (!center) {
        return res.status(404).json({ ok: false, message: "경로당 데이터를 찾을 수 없습니다." });
    }

    // ✅ 추가 2: 넘어온 작업자 이름이 있으면 DB 업데이트, 없으면 기존 DB 값이나 "작업자" 사용
    let finalWorkerName = center.workName || "작업자"; // 기존 값이 있으면 사용

    if (inputWorkName && inputWorkName.trim() !== "") {
        finalWorkerName = inputWorkName;
        // DB(SeniorCenterCleanUp)의 workName 필드 업데이트
        await center.update({ workName: finalWorkerName });
    }

   // ✅ 수정: 무조건 오늘 날짜(한국 서버 기준)로 고정 (YYYY.MM.DD 포맷)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const formattedWorkDate = `${year}.${month}.${day}`;

    // 2. PDF 파라미터 구성
    const pdfParams = {
      title: `${category === "AIR_CONDITIONER" ? "에어컨" : "공기청정기"} 세척 작업보고서`,
      centerName: center.name,
      agencyName: organization,
      companyName: "(주)제로브이",
      companyAddress: "부산광역시 해운대구 신반송로 151, 106호",
      companyPhone: "051-545-1150",
      ceoName: "김남관",
      workDate: formattedWorkDate,
      workerName:finalWorkerName,
      address: center.roadAddress,
      // ✅ 수정 3: report가 존재할 때만 매핑하고, 없으면 빈 객체({})를 전달
      photos: report ? {
        entranceImage: report.entranceImage,
        workImage1: report.workImage1,
        workImage2: report.workImage2,
        beforeImage1: report.beforeImage1,
        afterImage1: report.afterImage1,
        beforeImage2: report.beforeImage2,
        afterImage2: report.afterImage2,
      } : {}
    };

    // 3. PDF 버퍼 생성
    const pdfBuffer = await createSeniorCenterReportPdfBuffer(pdfParams);

    // 4. 파일명 설정 및 전송
    const fileName = `${organization}_${center.name}_${category}_작업보고서.pdf`;
   
    
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