import "dotenv/config";
import fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

import { sequelize } from "../db/sequelize";
import { CleanUpHousehold } from "../models/CleanUpHousehold";

const cleanCell = (v: any): string =>
  v === null || v === undefined ? "" : String(v).trim();

const normKey = (s: string) =>
  cleanCell(s)
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();

const toInt = (v: any): number | null => {
  const s = cleanCell(v);
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toStr = (v: any): string | null => {
  const s = cleanCell(v);
  return s ? s : null;
};

const normPhone = (v: any): string | null => {
  const s = cleanCell(v);
  return s ? s.replace(/\s+/g, "") : null;
};

const normRRN = (v: any): string => cleanCell(v) ?? "";

function densifyRow(row: any[], len: number): any[] {
  const out = new Array(len);
  for (let i = 0; i < len; i++) out[i] = row?.[i];
  return out;
}

function findColIncludes(headerNorm: string[], patterns: string[]) {
  const pats = patterns.map(normKey).filter(Boolean);
  for (let i = 0; i < headerNorm.length; i++) {
    const h = headerNorm[i] || "";
    if (!h) continue;
    if (pats.some((p) => h.includes(p))) return i;
  }
  return undefined;
}

function findColIncludesAll(headerNorm: string[], patternsAll: string[]) {
  const pats = patternsAll.map(normKey).filter(Boolean);
  for (let i = 0; i < headerNorm.length; i++) {
    const h = headerNorm[i] || "";
    if (!h) continue;
    if (pats.every((p) => h.includes(p))) return i;
  }
  return undefined;
}

function detectOtherReasonColumnIndex(headers: string[], dataRows: any[][], headerLen: number) {
  const emptyCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter((x) => x.h.startsWith("__EMPTY_"));

  if (emptyCols.length === 0) return null;

  const scanN = Math.min(dataRows.length, 80);
  let bestIdx: number | null = null;
  let bestScore = 0;

  for (const col of emptyCols) {
    let filled = 0;
    let textLike = 0;

    for (let r = 0; r < scanN; r++) {
      const row = densifyRow(dataRows[r] || [], headerLen);
      const s = cleanCell(row[col.idx]);
      if (s) {
        filled++;
        if (s.length >= 3) textLike++;
      }
    }

    const score = filled * 1 + textLike * 2;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = col.idx;
    }
  }

  if (bestScore < 10) return null;
  return bestIdx;
}

function findHeaderRowIndex(grid: any[][]) {
  const mustLike = ["연번", "동별", "성명", "도로명주소", "순위", "총점"].map(normKey);

  let bestIdx = -1;
  let bestScore = 0;

  const maxRows = Math.min(grid.length, 50);
  for (let i = 0; i < maxRows; i++) {
    const row = grid[i] || [];
    const nonEmpty = row.map(cleanCell).filter(Boolean).length;
    if (nonEmpty <= 2) continue;

    const rowNorm = row.map(cleanCell).map(normKey);
    let score = 0;
    for (const k of mustLike) if (rowNorm.includes(k)) score++;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx === -1 || bestScore < 4) return { headerRowIndex: -1, score: bestScore };
  return { headerRowIndex: bestIdx, score: bestScore };
}

async function bulkInsertInChunks(rows: any[], chunkSize = 250) {
  const before = await CleanUpHousehold.count();
  console.log("📌 DB before count:", before);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    try {
      await CleanUpHousehold.bulkCreate(chunk, {
        validate: true,
        ignoreDuplicates: true,
      });
    } catch (e: any) {
      // 어떤 레코드가 문제인지 빨리 보이게
      console.error("❌ bulkCreate failed at chunk starting index:", i);
      console.error(e?.message ?? e);

      // SequelizeBulkRecordError면 errors 배열에 원인 있음
      if (e?.errors?.length) {
        console.error("first error:", e.errors[0]?.message, e.errors[0]?.path);
      }
      throw e;
    }

    console.log(`✅ chunk processed ${Math.min(i + chunkSize, rows.length)}/${rows.length}`);
  }

  const after = await CleanUpHousehold.count();
  console.log("📌 DB after count:", after, "diff:", after - before);
}

async function main() {
  const EXCEL_PATH = (process.env.EXCEL_PATH || path.resolve("세대.xlsx")).trim();

  console.log("--------------------------------------------------");
  console.log("cwd:", process.cwd());
  console.log("EXCEL_PATH:", EXCEL_PATH);
  console.log("excel exists:", fs.existsSync(EXCEL_PATH));
  console.log("--------------------------------------------------");

  if (!fs.existsSync(EXCEL_PATH)) throw new Error(`엑셀 파일이 없습니다: ${EXCEL_PATH}`);

  await sequelize.authenticate();
  console.log("✅ DB connected");

  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 시트가 없습니다.");

  const ws = wb.Sheets[sheetName];
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  if (grid.length < 2) throw new Error("엑셀 데이터가 비어있습니다.");

  const { headerRowIndex, score } = findHeaderRowIndex(grid);
  if (headerRowIndex === -1) throw new Error(`헤더 행을 찾지 못했습니다. (score=${score})`);
  console.log(`✅ headerRowIndex: ${headerRowIndex + 1}행 (score=${score})`);

  const headerRaw = grid[headerRowIndex] || [];
  const dataRows = grid.slice(headerRowIndex + 1);

  const dataMaxLen = Math.max(0, ...dataRows.slice(0, 100).map((r) => (r ? r.length : 0)));
  const headerLen = Math.max(headerRaw.length, dataMaxLen);

  const headerDense = densifyRow(headerRaw, headerLen).map((h) => cleanCell(h));
  const headers = headerDense.map((h, idx) => (h ? h : `__EMPTY_${idx}`));
  const headerNorm = headers.map((h) => normKey(h));

  console.log("✅ headers:", headers);

  const idxNo = findColIncludes(headerNorm, ["연번"]);
  const idxCategory = findColIncludes(headerNorm, ["구분"]);
  const idxDong = findColIncludes(headerNorm, ["동별"]);
  const idxBenefit = findColIncludes(headerNorm, ["수급형태"]);
  const idxName = findColIncludes(headerNorm, ["성명"]);
  const idxRRN = findColIncludes(headerNorm, ["주민등록번호"]);
  const idxPhone = findColIncludes(headerNorm, ["핸드폰번호", "휴대폰번호"]);
  const idxProxy = findColIncludes(headerNorm, ["대리인등번호", "대리인번호", "연락가능대리인"]);
  const idxRoad = findColIncludes(headerNorm, ["도로명주소"]);
  const idxDetail = findColIncludes(headerNorm, ["상세주소"]);
  const idxRank = findColIncludes(headerNorm, ["순위"]);
  const idxTotal = findColIncludes(headerNorm, ["총점"]);

  const idxScoreHousehold = findColIncludes(headerNorm, ["세대원수"]);
  const idxScoreAge = findColIncludes(headerNorm, ["연령"]);
  const idxScoreDisability = findColIncludes(headerNorm, ["장애유무", "장애"]);
  const idxScoreResidence = findColIncludes(headerNorm, ["거주기간"]);
  const idxScoreBenefit = findColIncludesAll(headerNorm, ["수급형태", "10점"]);
  const idxScoreOther = findColIncludes(headerNorm, ["기타", "30점"]);
  const idxRemark = findColIncludes(headerNorm, ["비고"]);

  console.log("✅ column indexes:", {
    idxNo,
    idxCategory,
    idxDong,
    idxBenefit,
    idxName,
    idxRRN,
    idxPhone,
    idxProxy,
    idxRoad,
    idxDetail,
    idxRank,
    idxTotal,
    idxScoreHousehold,
    idxScoreAge,
    idxScoreDisability,
    idxScoreResidence,
    idxScoreBenefit,
    idxScoreOther,
    idxRemark,
  });

  const otherReasonColIdx = detectOtherReasonColumnIndex(headers, dataRows, headerLen);
  console.log("✅ otherReasonColIdx:", otherReasonColIdx);

  const mapped: any[] = [];
  let skipped = 0;

  for (let r = 0; r < dataRows.length; r++) {
    const row = densifyRow(dataRows[r] || [], headerLen);
    const excelRowNo = headerRowIndex + 2 + r;

    if (row.every((x) => !cleanCell(x))) continue;

    const rank = idxRank !== undefined ? toInt(row[idxRank]) ?? 0 : 0;
    const listType = rank <= 300 ? "SELECTED" : "WAITLIST";

    const now = new Date(); // ✅ timestamps 강제 주입

    const item = {
      programYear: 2025,
      listType,

      localNo: idxNo !== undefined ? toInt(row[idxNo]) ?? 0 : 0,
      categoryCode: idxCategory !== undefined ? toInt(row[idxCategory]) ?? 0 : 0,

      dong: idxDong !== undefined ? toStr(row[idxDong]) ?? "" : "",
      benefitType: idxBenefit !== undefined ? toStr(row[idxBenefit]) ?? "" : "",

      name: idxName !== undefined ? toStr(row[idxName]) ?? "" : "",
      rrn: idxRRN !== undefined ? normRRN(row[idxRRN]) : "",

      phone: idxPhone !== undefined ? normPhone(row[idxPhone]) : null,
      proxyPhone: idxProxy !== undefined ? normPhone(row[idxProxy]) : null,

      roadAddress: idxRoad !== undefined ? toStr(row[idxRoad]) ?? "" : "",
      detailAddress: idxDetail !== undefined ? toStr(row[idxDetail]) : null,

      rank,
      totalScore: idxTotal !== undefined ? toInt(row[idxTotal]) ?? 0 : 0,

      scoreHouseholdSize: idxScoreHousehold !== undefined ? toInt(row[idxScoreHousehold]) : null,
      scoreAge: idxScoreAge !== undefined ? toInt(row[idxScoreAge]) : null,
      scoreDisability:
        idxScoreDisability !== undefined ? toInt(row[idxScoreDisability]) : null,
      scoreResidencePeriod:
        idxScoreResidence !== undefined ? toInt(row[idxScoreResidence]) : null,
      scoreBenefitType: idxScoreBenefit !== undefined ? toInt(row[idxScoreBenefit]) : null,
      scoreOther: idxScoreOther !== undefined ? toInt(row[idxScoreOther]) : null,

      otherReason: otherReasonColIdx !== null ? toStr(row[otherReasonColIdx]) : null,
      remark: idxRemark !== undefined ? toStr(row[idxRemark]) : null,

      // ✅ 이 두 개가 없어서 너 에러가 난 거임
      createdAt: now,
      updatedAt: now,
    };

    if (!item.rank || !item.dong || !item.name || !item.roadAddress) {
      skipped++;
      if (skipped <= 20) {
        console.log("❗ SKIP excel row", excelRowNo, "missing required", {
          rank: item.rank,
          dong: item.dong,
          name: item.name,
          roadAddress: item.roadAddress,
        });
      }
      continue;
    }

    mapped.push(item);
  }

  console.log("✅ parsed rows:", mapped.length);
  console.log("✅ skipped rows:", skipped);

  if (mapped.length === 0) throw new Error("파싱 결과(mapped)가 0입니다.");

  await bulkInsertInChunks(mapped, 250);

  console.log("🎉 import done");
  await sequelize.close();
}

main().catch((e) => {
  console.error("❌ import failed:", e);
  process.exit(1);
});
