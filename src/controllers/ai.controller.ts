import { Request, Response, NextFunction } from "express";
import { WorkReport } from "../models/WorkReport";
import { WorkReportChecklist } from "../models/WorkReportChecklist";
import { KpiDaily } from "../models/KpiDaily";
import { EnvDaily } from "../models/EnvDaily";
import { openai } from "../services/openai";
import { calcMoldIndex, calcSoilIndex } from "../services/envScore";

function monthsToDays(m: number) {
  return Math.max(1, Math.min(24, m)) * 31; // 대충 안전한 범위
}

/** =========================
 *  A) 개별 보고서 예측
 *  POST /ai/predict/report/:reportId
 * ========================= */
export async function predictByReport(req: Request, res: Response, next: NextFunction) {
  try {
    const reportId = Number(req.params.reportId);
    if (!reportId) return res.status(400).json({ message: "reportId가 올바르지 않습니다." });

    const report = await WorkReport.findByPk(reportId);
    const checklist = await WorkReportChecklist.findOne({ where: { reportId } });

    if (!report || !checklist) return res.status(404).json({ message: "보고서/체크리스트가 없습니다." });

    // 내부 점수(환경지표) 계산
    const moldIndex = calcMoldIndex(checklist);
    const soilIndex = calcSoilIndex(checklist);

    // ✅ GPT에게 줄 입력 (너무 길게 주지 말고 핵심만)
    const input = {
      reportId,
      workDate: report.workDate,
      facilityType: checklist.facilityType,
      equipment: {
        ceiling: checklist.equipCeiling,
        stand: checklist.equipStand,
        wall: checklist.equipWall,
      },
      complaintHistory: checklist.complaintHistory,
      workScope: checklist.workScope,
      env: {
        useDensity: checklist.useDensity,
        leakTrace: checklist.leakTrace,
        noiseVibration: checklist.noiseVibration,
        moldVisual: checklist.moldVisual,
        moldIndex,
        soilIndex,
      },
      unit: {
        unitExterior: checklist.unitExterior,
        panelDamage: checklist.panelDamage,
        unitLeak: checklist.unitLeak,
        unitNoise: checklist.unitNoise,
        unitMold: checklist.unitMold,
        evaSoil: checklist.evaSoil,
        slime: checklist.slime,
        odor: checklist.odor,
        moldTrace: checklist.moldTrace,
        washNeed: checklist.washNeed,
      },
    };

    const system = `
너는 "공공시설 냉난방/공기질 유지관리" 데이터 분석가다.
주어진 체크리스트로 30~90일 내 발생 가능한 리스크를 예측한다.
반드시 JSON만 출력한다.`;

    const user = `
아래 입력을 바탕으로 예측해라.
우선순위:
1) 매출(이 보고서 기준: 추가 작업/확장 패키지/재방문 가능성 등으로 매출 증감 요인)
2) 문의/AS 위험(민원/AS 발생 가능성)
3) 환경(곰팡이/오염 악화 가능성)

출력 JSON 스키마:
{
  "reportId": number,
  "risk": { "complaint": 0-100, "as": 0-100, "failure": 0-100 },
  "envForecast": { "mold": 0-100, "soil": 0-100, "note": string },
  "revenueImpact": { "expectedUpsell": "LOW|MEDIUM|HIGH", "reason": string },
  "actions": [{ "priority": "P0|P1|P2", "title": string, "detail": string }],
  "confidence": 0-100
}

입력:
${JSON.stringify(input)}
`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() },
      ],
    });
    console.log('ai');
    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    // ✅ DB에도 간단 반영(기존 필드 활용)
    // - complaintRisk / failureRisk / hygieneScore(환경점수 대체)
    await checklist.update({
      aiComplaintRisk: Number(parsed?.risk?.complaint ?? null),
      aiFailureRisk: Number(parsed?.risk?.failure ?? null),
      aiHygieneScore: Number(parsed?.envForecast?.mold ?? null), // (원하면 mold/soil을 따로 칼럼 추가 추천)
    });

    return res.json({ ok: true, result: parsed, rawIfNotJson: typeof parsed?.raw === "string" ? parsed.raw : undefined });
  } catch (e) {
    console.log('오류')
    next(e);
  }
}

/** =========================
 *  B) 최근 6개월 전체 예측
 *  GET /ai/predict/summary?months=6
 * ========================= */
export async function predictSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const months = Number(req.query.months ?? 6);
    const days = monthsToDays(months);

    // 최근 N일 KPI/환경 데이터 로드
    const kpis = await KpiDaily.findAll({
      order: [["date", "ASC"]],
      limit: days,
    });
    const envs = await EnvDaily.findAll({
      order: [["date", "ASC"]],
      limit: days,
    });

    // (선택) 최근 6개월 체크리스트 통계(곰팡이 severe 비율 등)
    // - 여기선 예시로만: count, severe 비율 정도를 추출
    const { Op } = require("sequelize");
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const checklists = await WorkReportChecklist.findAll({
      where: { createdAt: { [Op.gte]: since } },
      attributes: ["moldVisual", "washNeed", "complaintHistory", "exteriorSoil", "evaSoil"],
    });

    const stats = {
      total: checklists.length,
      moldSevereRate:
        checklists.length === 0 ? 0 :
        Math.round((checklists.filter((c: any) => c.moldVisual === "SEVERE").length / checklists.length) * 100),
      washRequiredRate:
        checklists.length === 0 ? 0 :
        Math.round((checklists.filter((c: any) => c.washNeed === "REQUIRED").length / checklists.length) * 100),
    };

    const input = {
      rangeMonths: months,
      kpiDaily: kpis.map((r: any) => ({
        date: r.date, revenue: r.revenue, inquiryCount: r.inquiryCount, asCount: r.asCount,
      })),
      envDaily: envs.map((r: any) => ({
        date: r.date, moldIndex: r.moldIndex, soilIndex: r.soilIndex,
      })),
      checklistStats: stats,
    };

    const system = `
너는 "공공시설 토탈클린케어 운영" 예측 분석가다.
최근 데이터로 다음 1~3개월을 예측한다.
반드시 JSON만 출력한다.`;

    const user = `
우선순위:
1) 매출(Revenue) 예측
2) 문의(Inquiry) & AS 예측
3) 환경(곰팡이/오염/미세먼지·황사 시즌 영향은 내부지표로 추정)

출력 JSON 스키마:
{
  "rangeMonths": number,
  "forecastHorizon": "1M|2M|3M",
  "sales": { "next1M": { "median": number, "low": number, "high": number }, "drivers": string[] },
  "inquiry": { "next1M": { "median": number, "low": number, "high": number }, "drivers": string[] },
  "as": { "next1M": { "median": number, "low": number, "high": number }, "drivers": string[] },
  "environment": {
    "moldRisk": { "next1M": 0-100, "note": string },
    "dustRisk": { "next1M": 0-100, "note": string }
  },
  "alerts": [{ "type": "SALES|INQUIRY|AS|ENV", "level": "HIGH|MEDIUM|LOW", "message": string }],
  "recommendedActions": [{ "priority": "P0|P1|P2", "title": string, "detail": string }],
  "confidence": 0-100
}

입력:
${JSON.stringify(input)}
`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.15,
      max_tokens: 1200,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    return res.json({ ok: true, result: parsed, inputMeta: { kpiDays: kpis.length, envDays: envs.length, checklistStats: stats } });
  } catch (e) {
    next(e);
  }
}
