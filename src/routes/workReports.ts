import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { sequelize } from "../db/sequelize";
import { CleanUpHousehold } from "../models/CleanUpHousehold";
import { WorkReport } from "../models/WorkReport";
import { SurveyResponse } from "../models/SurveyResponse";
import { SurveyResponseAnswer } from "../models/SurveyResponseAnswer";
import { Survey } from "../models/Survey";
import { SurveyQuestion } from "../models/SurveyQuestion";
import { SurveyQuestionOption } from "../models/SurveyQuestionOption";
import { createWorkReportPdfBuffer } from "../services/createWorkReportPdf";
import moment from "moment";
import {
  makeWorkReportTitle,
  makeSafePdfFileName,
  encodeRFC5987ValueChars,
} from "../utils/fileName";

const router = Router();

const bodySchema = z.object({
  jobName: z.string().trim().min(1, "작업명을 입력해 주세요."),
  workDate: z.string().trim().min(1, "작업일자를 입력해 주세요."),
  workerName: z.string().trim().min(1, "작업자를 입력해 주세요."),
  memo: z.string().optional().nullable(),
});

function formatDate(value?: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${y}. ${m}. ${d}.`;
}

function getHouseholdAddress(household: any) {
  return [household?.roadAddress, household?.detailAddress]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getAnswerText(question: any, answer: any) {
  if (!answer) return "-";

  if (answer.subjectiveAnswer) {
    return answer.subjectiveAnswer;
  }

  if (answer.selectedOptionNo != null && Array.isArray(question?.options)) {
    const selected = question.options.find(
      (opt: any) => opt.optionNo === answer.selectedOptionNo
    );
    return selected?.optionText ?? "-";
  }

  return "-";
}

/**
 * 최신 작업보고서 조회
 * GET /work-reports/household/:householdId/latest
 */
router.get("/household/:householdId/latest", async (req: Request, res: Response) => {
  try {
    const householdId = Number(req.params.householdId);

    if (!Number.isInteger(householdId) || householdId <= 0) {
      return res.status(400).json({ message: "유효하지 않은 householdId 입니다." });
    }

    const item = await WorkReport.findOne({
      where: { householdId },
      order: [["createdAt", "DESC"]],
    });

    if (!item) {
      return res.status(404).json({ message: "저장된 작업보고서가 없습니다." });
    }

    return res.json({ item });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      message: error?.message || "작업보고서 조회에 실패했습니다.",
    });
  }
});

// /**
//  * 저장된 PDF 다운로드
//  * GET /work-reports/:id/download
//  */
// router.get("/:id/download", async (req: Request, res: Response) => {
//   try {
//     const id = Number(req.params.id);

//     if (!Number.isInteger(id) || id <= 0) {
//       return res.status(400).json({ message: "유효하지 않은 ID입니다." });
//     }

//     const item = await WorkReport.findByPk(id);

//     if (!item) {
//       return res.status(404).json({ message: "작업보고서를 찾을 수 없습니다." });
//     }

//     if (!item.pdfPath) {
//       return res.status(404).json({ message: "저장된 PDF가 없습니다." });
//     }

//     const absolutePath = path.resolve(
//       process.cwd(),
//       item.pdfPath.replace(/^\/+/, "")
//     );

//     if (!fs.existsSync(absolutePath)) {
//       return res.status(404).json({ message: "PDF 파일이 존재하지 않습니다." });
//     }

//     const title = makeSafePdfFileName(
//       makeWorkReportTitle(item.dongName, item.residentName)
//     );

//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="work-report.pdf"; filename*=UTF-8''${encodeRFC5987ValueChars(
//         title
//       )}`
//     );

//     return fs.createReadStream(absolutePath).pipe(res);
//   } catch (error: any) {
//     console.error(error);
//     return res.status(500).json({
//       message: error?.message || "PDF 다운로드에 실패했습니다.",
//     });
//   }
// });

/**
 * 작업보고서 생성 + PDF 생성 + DB 저장 + 즉시 다운로드
 * POST /work-reports/household/:householdId/pdf
 */
router.post(
  "/:householdId/pdf",
  async (req: Request, res: Response) => {
    const tx = await sequelize.transaction();

    try {
      const householdId = Number(req.params.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        await tx.rollback();
        return res.status(400).json({ message: "유효하지 않은 householdId 입니다." });
      }

      const body = bodySchema.parse(req.body);

      const household = await CleanUpHousehold.findByPk(householdId, {
        transaction: tx,
      });

      if (!household) {
        await tx.rollback();
        return res.status(404).json({ message: "대상자 정보를 찾을 수 없습니다." });
      }

      const householdAny = household as any;

      const dongName =
        householdAny.dong ??
        householdAny.administrativeDong ??
        householdAny.eupMyeonDong ??
        "";

      const residentName =
        householdAny.name ??
        householdAny.householderName ??
        "";

      const address = getHouseholdAddress(householdAny) || "-";
      // 1. workDate 유효성 검사 및 안전한 할당
let safeWorkDate = body.workDate;
// 만약 body.workDate가 'Invalid date'이거나 유효하지 않다면 오늘 날짜로 대체
if (!safeWorkDate || safeWorkDate === "Invalid date" || !moment(safeWorkDate).isValid()) {
  safeWorkDate = moment().format("YYYY-MM-DD"); 
} else {
  // 형식을 DB 규격(YYYY-MM-DD)에 맞게 통일
  safeWorkDate = moment(safeWorkDate).format("YYYY-MM-DD");
}
      const report = await WorkReport.create(
        {
          householdId,
          dongName,
          residentName,
          jobName: body.jobName,
          workDate: safeWorkDate,
          workerName: body.workerName,
          address,
          memo: body.memo ?? null,
        },
        { transaction: tx }
      );

      const surveyResponse = await SurveyResponse.findOne({
        where: { householdId },
        order: [["submittedAt", "DESC"]],
        include: [
          {
            model: Survey,
            as: "survey",
            include: [
              {
                model: SurveyQuestion,
                as: "questions",
                include: [
                  {
                    model: SurveyQuestionOption,
                    as: "options",
                  },
                ],
              },
            ],
          },
          {
            model: SurveyResponseAnswer,
            as: "answers",
          },
        ],
        transaction: tx,
      });

      const surveyAnswers: {
        question: string;
        type: "multiple" | "subjective";
        answer: string;
        choices?: { optionNo: number; optionText: string; selected: boolean }[];
      }[] = [];

      const questions = ((surveyResponse as any)?.survey?.questions ?? []) as any[];
      const answers = ((surveyResponse as any)?.answers ?? []) as any[];

      for (const q of questions) {
        const matched = answers.find((a) => a.questionId === q.id);

        if (q.type === "multiple") {
          surveyAnswers.push({
            question: q.question ?? "",
            type: "multiple",
            answer: getAnswerText(q, matched),
            choices: Array.isArray(q.options)
              ? q.options.map((opt: any) => ({
                optionNo: opt.optionNo,
                optionText: opt.optionText,
                selected: matched?.selectedOptionNo === opt.optionNo,
              }))
              : [],
          });
        } else {
          surveyAnswers.push({
            question: q.question ?? "",
            type: "subjective",
            answer: matched?.subjectiveAnswer ?? "",
          });
        }
      }

      const title = '해운대구 취약계층 에어컨 클린UP 작업사진';//makeWorkReportTitle(dongName, residentName);
      const fileName = makeSafePdfFileName(title);

      const surveyInfo = (surveyResponse as any)?.survey;
      const responseInfo = surveyResponse as any;

      console.log(surveyInfo);
      const pdfBuffer = await createWorkReportPdfBuffer({
        title,
        name:householdAny.name,
        agencyName: dongName,
        companyName: report.companyName,
        companyPhone: report.companyPhone,
        jobName: '해운대구 취약계층 에어클린 UP',//report.jobName ?? "-",
        workDate: report.workDate ? moment(report.workDate, ["YYYY-MM-DD", "YYYY.MM.DD"]).format('YYYY.MM.DD') : "-",
        workerName: report.workerName ?? "-",
        address: report.address ?? "-",
        memo:  responseInfo?.reportMemo??"",
        surveyTitle: surveyInfo?.title ?? "설문조사",
        surveyIntro: surveyInfo?.intro ?? "",
        surveyMeta: {
          year: String(new Date().getFullYear()),
          month: responseInfo?.surveyMonth ? String(responseInfo.surveyMonth) : "",
          day: responseInfo?.surveyDay ? String(responseInfo.surveyDay) : "",
          respondentName: responseInfo?.respondentName ?? "",
          signaturePath: responseInfo?.signaturePath ?? null,
        },
        photos: {
          addressImage: householdAny.addressImage,
          beforeImage: householdAny.beforeImage,
          duringImage: householdAny.duringImage,
          afterImage: householdAny.afterImage,
        },
        surveyAnswers,
      });

      const dirPath = path.resolve(process.cwd(), "uploads/work-reports");
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const storedFileName = `${report.id}_${Date.now()}.pdf`;
      const filePath = path.join(dirPath, storedFileName);

      //fs.writeFileSync(filePath, pdfBuffer);

      // report.pdfPath = `/uploads/work-reports/${storedFileName}`;
      // await report.save({ transaction: tx });
      

      await tx.commit();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", pdfBuffer.length);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="work-report.pdf"; filename*=UTF-8''${encodeRFC5987ValueChars(
          fileName
        )}`
      );

      return res.send(pdfBuffer);
    } catch (error: any) {
      await tx.rollback();
      console.error(error);

      return res.status(500).json({
        message: error?.message || "PDF 생성 중 오류가 발생했습니다.",
      });
    }
  }
);

export default router;