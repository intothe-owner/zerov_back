import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { sequelize } from "../db/sequelize";
import { Survey } from "../models/Survey";
import { SurveyQuestion } from "../models/SurveyQuestion";
import { SurveyQuestionOption } from "../models/SurveyQuestionOption";

import { CleanUpHousehold } from "../models/CleanUpHousehold";
import { SurveyResponse } from "../models/SurveyResponse";
import { SurveyResponseAnswer } from "../models/SurveyResponseAnswer";
const router = Router();

type QuestionType = "multiple" | "subjective";

type SaveSurveyQuestion =
  | {
      type: "multiple";
      question: string;
      options: [string, string, string, string, string];
    }
  | {
      type: "subjective";
      question: string;
    };

type SaveSurveyBody = {
  title: string;
  intro?: string | null;
  questions: SaveSurveyQuestion[];
};
type SubmitSurveyBody = {
  householdId: number;
  surveyId: number;
  surveyMonth: string;
  surveyDay: string;
  surveyName: string;
  signatureDataUrl: string;
  answers: Array<{
    questionId: number;
    type: "multiple" | "subjective";
    selectedOptionNo?: number | null;
    subjectiveAnswer?: string | null;
  }>;
};
function isValidQuestionType(value: unknown): value is QuestionType {
  return value === "multiple" || value === "subjective";
}

function validateSaveSurveyBody(body: any): { ok: true } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    return { ok: false, message: "설문 제목을 입력해 주세요." };
  }

  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return { ok: false, message: "문항은 최소 1개 이상이어야 합니다." };
  }

  for (let i = 0; i < body.questions.length; i += 1) {
    const q = body.questions[i];

    if (!q || typeof q !== "object") {
      return { ok: false, message: `${i + 1}번 문항 형식이 올바르지 않습니다.` };
    }

    if (!isValidQuestionType(q.type)) {
      return { ok: false, message: `${i + 1}번 문항 타입이 올바르지 않습니다.` };
    }

    if (!q.question || typeof q.question !== "string" || !q.question.trim()) {
      return { ok: false, message: `${i + 1}번 문항 질문을 입력해 주세요.` };
    }

    if (q.type === "multiple") {
      if (!Array.isArray(q.options) || q.options.length !== 5) {
        return { ok: false, message: `${i + 1}번 객관식 문항은 보기 5개가 필요합니다.` };
      }

      for (let j = 0; j < q.options.length; j += 1) {
        const opt = q.options[j];
        if (typeof opt !== "string" || !opt.trim()) {
          return {
            ok: false,
            message: `${i + 1}번 문항의 ${j + 1}번 보기를 입력해 주세요.`,
          };
        }
      }
    }
  }

  return { ok: true };
}
//서명 저장
const signatureUploadDir = path.resolve(process.cwd(), "uploads", "survey-signatures");
fs.mkdirSync(signatureUploadDir, { recursive: true });
function isBase64SignatureDataUrl(value: string) {
  return /^data:image\/png;base64,/.test(value);
}
function saveBase64Signature(base64: string, householdId: number) {
  const match = base64.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    throw new Error("서명 데이터 형식이 올바르지 않습니다.");
  }

  const buffer = Buffer.from(match[1], "base64");
  const filename = `survey_signature_${householdId}_${Date.now()}.png`;
  const fullPath = path.join(signatureUploadDir, filename);

  fs.writeFileSync(fullPath, buffer);
  return `/uploads/survey-signatures/${filename}`;
}
/**
 * POST /survey
 * 설문 저장
 */
router.post("/", async (req: Request, res: Response) => {
  const body = req.body as SaveSurveyBody;
  const validation = validateSaveSurveyBody(body);

  if (!validation.ok) {
    return res.status(400).json({
      message: validation.message,
    });
  }

  const tx = await sequelize.transaction();

  try {
    // 기존 활성 설문 비활성화
    await Survey.update(
      { isActive: false },
      {
        where: { isActive: true },
        transaction: tx,
      }
    );

    // 새 설문 생성
    const survey = await Survey.create(
      {
        title: body.title.trim(),
        intro: body.intro?.trim() || null,
        isActive: true,
      },
      { transaction: tx }
    );

    for (let i = 0; i < body.questions.length; i += 1) {
      const q = body.questions[i];

      const createdQuestion = await SurveyQuestion.create(
        {
          surveyId: survey.id,
          type: q.type,
          question: q.question.trim(),
          sortOrder: i + 1,
        },
        { transaction: tx }
      );

      if (q.type === "multiple") {
        const optionRows = q.options.map((option, index) => ({
          questionId: createdQuestion.id,
          optionNo: index + 1,
          optionText: option.trim(),
        }));

        await SurveyQuestionOption.bulkCreate(optionRows, {
          transaction: tx,
        });
      }
    }

    await tx.commit();

    return res.status(201).json({
      message: "설문이 저장되었습니다.",
      item: {
        id: survey.id,
        title: survey.title,
        intro: survey.intro,
        isActive: survey.isActive,
      },
    });
  } catch (err: any) {
    await tx.rollback();
    console.error(err);

    return res.status(500).json({
      message: "설문 저장에 실패했습니다.",
      error: err?.message ?? String(err),
    });
  }
});

/**
 * GET /survey/active
 * 현재 활성 설문 조회
 */
router.get("/active", async (_req: Request, res: Response) => {
  try {
    const survey = await Survey.findOne({
      where: { isActive: true },
      order: [["id", "DESC"]],
      include: [
        {
          model: SurveyQuestion,
          as: "questions",
          required: false,
          separate: true,
          order: [["sortOrder", "ASC"]],
          include: [
            {
              model: SurveyQuestionOption,
              as: "options",
              required: false,
              separate: true,
              order: [["optionNo", "ASC"]],
            },
          ],
        },
      ],
    });

    if (!survey) {
      return res.status(404).json({
        message: "활성 설문이 없습니다.",
      });
    }

    const questions = (survey as any).questions ?? [];

    return res.json({
      item: {
        id: survey.id,
        title: survey.title,
        intro: survey.intro,
        isActive: survey.isActive,
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
        questions: questions.map((q: any) => ({
          id: q.id,
          type: q.type,
          question: q.question,
          sortOrder: q.sortOrder,
          options:
            q.type === "multiple"
              ? ((q.options ?? []) as any[]).map((opt) => ({
                  id: opt.id,
                  optionNo: opt.optionNo,
                  optionText: opt.optionText,
                }))
              : [],
        })),
      },
    });
  } catch (err: any) {
    console.error(err);

    return res.status(500).json({
      message: "설문 조회에 실패했습니다.",
      error: err?.message ?? String(err),
    });
  }
});
/**
 * DELETE /survey/active
 * 현재 활성 설문 초기화(삭제)
 */
router.delete("/active", async (_req: Request, res: Response) => {
  const tx = await sequelize.transaction();

  try {
    const survey = await Survey.findOne({
      where: { isActive: true },
      transaction: tx,
    });

    if (!survey) {
      await tx.rollback();
      return res.status(404).json({
        message: "초기화할 활성 설문이 없습니다.",
      });
    }

    await survey.destroy({ transaction: tx });

    await tx.commit();

    return res.json({
      message: "설문이 초기화되었습니다.",
    });
  } catch (err: any) {
    await tx.rollback();
    console.error(err);

    return res.status(500).json({
      message: "설문 초기화에 실패했습니다.",
      error: err?.message ?? String(err),
    });
  }
});
router.post("/submit", async (req: Request, res: Response) => {
  const body = req.body as SubmitSurveyBody;
  const tx = await sequelize.transaction();

  try {
    const householdId = Number(body.householdId);
    const surveyId = Number(body.surveyId);
    const surveyMonth = Number(body.surveyMonth);
    const surveyDay = Number(body.surveyDay);
    const surveyName = String(body.surveyName ?? "").trim();
    const signatureDataUrl = String(body.signatureDataUrl ?? "").trim();
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (!Number.isInteger(householdId) || householdId <= 0) {
      await tx.rollback();
      return res.status(400).json({ message: "대상자 정보가 올바르지 않습니다." });
    }

    if (!Number.isInteger(surveyId) || surveyId <= 0) {
      await tx.rollback();
      return res.status(400).json({ message: "설문 정보가 올바르지 않습니다." });
    }

    if (!surveyName) {
      await tx.rollback();
      return res.status(400).json({ message: "성명을 입력해 주세요." });
    }

    if (!surveyMonth || surveyMonth < 1 || surveyMonth > 12) {
      await tx.rollback();
      return res.status(400).json({ message: "월 정보가 올바르지 않습니다." });
    }

    if (!surveyDay || surveyDay < 1 || surveyDay > 31) {
      await tx.rollback();
      return res.status(400).json({ message: "일 정보가 올바르지 않습니다." });
    }

    const survey = await Survey.findOne({
      where: { id: surveyId, isActive: true },
      include: [
        {
          model: SurveyQuestion,
          as: "questions",
          required: false,
        },
      ],
      transaction: tx,
    });

    if (!survey) {
      await tx.rollback();
      return res.status(404).json({ message: "활성 설문을 찾을 수 없습니다." });
    }

    const household = await CleanUpHousehold.findByPk(householdId, {
      transaction: tx,
    });

    if (!household) {
      await tx.rollback();
      return res.status(404).json({ message: "대상자를 찾을 수 없습니다." });
    }

    // 기존 서명 우선 확인
let signaturePath = household.surveySignature ?? null;

// 새로 그린 base64 서명일 때만 파일 저장
if (signatureDataUrl && isBase64SignatureDataUrl(signatureDataUrl)) {
  signaturePath = saveBase64Signature(signatureDataUrl, householdId);
}

// 프론트가 기존 서명 URL(http://..., /uploads/...)을 보내는 경우는
// 새 저장 없이 기존 서명 재사용
if (!signaturePath) {
  await tx.rollback();
  return res.status(400).json({ message: "서명을 입력해 주세요." });
}

    household.surveySignature = signaturePath;
    household.surveySubmittedAt = new Date();
    household.surveySubmittedByName = surveyName;
    await household.save({ transaction: tx });

    const response = await SurveyResponse.create(
      {
        surveyId: survey.id,
        householdId: household.id,
        respondentName: surveyName,
        surveyYear: new Date().getFullYear(),
        surveyMonth,
        surveyDay,
        signaturePath,
        submittedAt: new Date(),
      },
      { transaction: tx }
    );

    const questionMap = new Map<number, any>();
    const surveyQuestions = (survey as any).questions ?? [];
    for (const q of surveyQuestions) {
      questionMap.set(q.id, q);
    }

    const answerRows = answers.map((answer) => {
      const q = questionMap.get(answer.questionId);
      if (!q) {
        throw new Error(`유효하지 않은 문항입니다. questionId=${answer.questionId}`);
      }

      if (q.type === "multiple") {
        if (!answer.selectedOptionNo) {
          throw new Error(`객관식 응답이 누락되었습니다. questionId=${answer.questionId}`);
        }

        return {
          responseId: response.id,
          questionId: answer.questionId,
          selectedOptionNo: answer.selectedOptionNo,
          subjectiveAnswer: null,
        };
      }

      return {
        responseId: response.id,
        questionId: answer.questionId,
        selectedOptionNo: null,
        subjectiveAnswer: String(answer.subjectiveAnswer ?? "").trim() || null,
      };
    });

    await SurveyResponseAnswer.bulkCreate(answerRows, { transaction: tx });

    await tx.commit();

    return res.status(201).json({
      message: "설문 응답이 저장되었습니다.",
      item: {
        responseId: response.id,
        surveyId: response.surveyId,
        householdId: response.householdId,
        respondentName: response.respondentName,
        signaturePath: response.signaturePath,
        submittedAt: response.submittedAt,
      },
    });
  } catch (err: any) {
    await tx.rollback();
    console.error(err);
    return res.status(500).json({
      message: "설문 응답 저장에 실패했습니다.",
      error: err?.message ?? String(err),
    });
  }
});

/**
 * 특정 household의 가장 최근 설문 응답 조회
 */
router.get("/response/household/:householdId", async (req: Request, res: Response) => {
  try {
    const householdId = Number(req.params.householdId);

    if (!Number.isInteger(householdId) || householdId <= 0) {
      return res.status(400).json({
        message: "대상자 ID가 올바르지 않습니다.",
      });
    }

    const response = await SurveyResponse.findOne({
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
              required: false,
              include: [
                {
                  model: SurveyQuestionOption,
                  as: "options",
                  required: false,
                },
              ],
            },
          ],
        },
        {
          model: SurveyResponseAnswer,
          as: "answers",
          required: false,
        },
        {
          model: CleanUpHousehold,
          as: "household",
          required: false,
        },
      ],
    });

    if (!response) {
      return res.status(404).json({
        message: "저장된 설문 응답이 없습니다.",
      });
    }

    return res.json({
      item: response,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      message: "설문 응답 조회에 실패했습니다.",
      error: err?.message ?? String(err),
    });
  }
});
export default router;