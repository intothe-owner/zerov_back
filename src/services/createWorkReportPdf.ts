import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

type SurveyChoice = {
  optionNo: number;
  optionText: string;
  selected: boolean;
};

type SurveyAnswer = {
  question: string;
  type: "multiple" | "subjective";
  answer: string;
  choices?: SurveyChoice[];
};

type CreatePdfParams = {
  title: string;
  agencyName: string;
  companyName: string;
  companyPhone: string;
  jobName: string;
  workDate: string;
  workerName: string;
  address: string;
  memo?: string;

  surveyTitle?: string;
  surveyIntro?: string;
  surveyMeta?: {
    year?: string;
    month?: string;
    day?: string;
    respondentName?: string;
    signaturePath?: string | null;
  };

  photos: {
    addressImage?: string | null;
    beforeImage?: string | null;
    duringImage?: string | null;
    afterImage?: string | null;
  };

  surveyAnswers: SurveyAnswer[];
};

function resolveUploadPath(filePath?: string | null) {
  if (!filePath) return null;
  const clean = filePath.replace(/^\/+/, "");
  return path.resolve(process.cwd(), clean);
}

function registerFonts(doc: PDFKit.PDFDocument) {
  const regularPath = path.resolve(
    process.cwd(),
    "assets/fonts/NotoSansKR-Regular.ttf"
  );
  const boldPath = path.resolve(
    process.cwd(),
    "assets/fonts/NotoSansKR-Bold.ttf"
  );

  if (!fs.existsSync(regularPath)) {
    throw new Error(`한글 폰트가 없습니다: ${regularPath}`);
  }

  doc.registerFont("NotoSansKR", regularPath);

  if (fs.existsSync(boldPath)) {
    doc.registerFont("NotoSansKR-Bold", boldPath);
  } else {
    doc.registerFont("NotoSansKR-Bold", regularPath);
  }

  doc.font("NotoSansKR");
}

function textOrDash(value?: string | null) {
  return value && String(value).trim() ? String(value) : "-";
}

function drawImageBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  imagePath?: string | null
) {
  doc.font("NotoSansKR-Bold").fontSize(11).text(label, x, y - 18, {
    width: w,
    align: "center",
  });

  doc.rect(x, y, w, h).stroke();

  const absolute = resolveUploadPath(imagePath);
  if (absolute && fs.existsSync(absolute)) {
    try {
      doc.image(absolute, x + 6, y + 6, {
        fit: [w - 12, h - 12],
        align: "center",
        valign: "center",
      });
      return;
    } catch (err) {
      console.error("이미지 삽입 실패:", err);
    }
  }

  doc
    .font("NotoSansKR")
    .fontSize(10)
    .fillColor("#666")
    .text("이미지 없음", x, y + h / 2 - 8, {
      width: w,
      align: "center",
    })
    .fillColor("#000");
}

function drawInfoRow(
  doc: PDFKit.PDFDocument,
  y: number,
  label1: string,
  value1: string,
  label2: string,
  value2: string
) {
  const rowH = 34;

  doc.rect(40, y, 515, rowH).stroke();
  doc.moveTo(110, y).lineTo(110, y + rowH).stroke();
  doc.moveTo(315, y).lineTo(315, y + rowH).stroke();
  doc.moveTo(390, y).lineTo(390, y + rowH).stroke();

  doc.font("NotoSansKR-Bold").fontSize(11);
  doc.text(label1, 40, y + 10, { width: 70, align: "center" });
  doc.font("NotoSansKR").text(textOrDash(value1), 120, y + 10, {
    width: 180,
  });

  doc.font("NotoSansKR-Bold").text(label2, 320, y + 10, {
    width: 70,
    align: "center",
  });
  doc.font("NotoSansKR").text(textOrDash(value2), 400, y + 10, {
    width: 145,
  });

  return y + rowH;
}

function drawAddressRow(doc: PDFKit.PDFDocument, y: number, address: string) {
  const rowH = 34;

  doc.rect(40, y, 515, rowH).stroke();
  doc.moveTo(110, y).lineTo(110, y + rowH).stroke();

  doc.font("NotoSansKR-Bold").fontSize(11);
  doc.text("주소", 40, y + 10, { width: 70, align: "center" });
  doc.font("NotoSansKR").text(textOrDash(address), 120, y + 10, {
    width: 420,
  });

  return y + rowH;
}

function drawSurveyHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  intro: string,
  y: number
) {
  const titleBoxX = 60;
  const titleBoxY = y;
  const titleBoxW = 430; // 넓게
  const titleBoxH = 30;

  doc
    .fillColor("#fef3c7")
    .rect(titleBoxX, titleBoxY, titleBoxW, titleBoxH)
    .fill();

  doc.fillColor("#000");
  doc.font("NotoSansKR-Bold").fontSize(15).text(textOrDash(title), titleBoxX, titleBoxY + 6, {
    width: titleBoxW,
    align: "center",
    lineBreak: false, // 한 줄 유지
    ellipsis: false,
  });

  y += 44;

  doc
    .fillColor("#f3f4f6")
    .rect(60, y, 475, 74)
    .fill();

  doc.fillColor("#4b5563");
  doc.font("NotoSansKR").fontSize(10).text(textOrDash(intro), 72, y + 12, {
    width: 450,
    lineGap: 2,
  });

  return y + 92;
}

function drawMultipleChoiceBlock(
  doc: PDFKit.PDFDocument,
  index: number,
  question: string,
  choices: SurveyChoice[],
  y: number
) {
  const pageBottom = 770;

  doc.font("NotoSansKR-Bold").fontSize(12);

  const questionText = `${index}. ${textOrDash(question)}`;
  const titleHeight = doc.heightOfString(questionText, {
    width: 470,
    lineGap: 2,
  });

  const rows = Math.max(1, Math.ceil(choices.length / 2));
  const boxHeight = Math.max(52, rows * 22 + 18);

  const topGap = 12;
  const bottomGap = 24;
  const needed = titleHeight + topGap + boxHeight + bottomGap;

  if (y + needed > pageBottom) {
    doc.addPage();
    y = 40;
  }

  doc.fillColor("#111827");
  doc.font("NotoSansKR-Bold").fontSize(12).text(questionText, 60, y, {
    width: 470,
    lineGap: 2,
  });

  // 질문 높이만큼 정확히 아래로 이동
  y += titleHeight + topGap;

  doc.rect(60, y, 475, boxHeight).stroke();

  const leftX = 76;
  const rightX = 300;
  let row = 0;

  choices.forEach((choice, idx) => {
    const colX = idx % 2 === 0 ? leftX : rightX;
    if (idx % 2 === 0 && idx > 0) row += 1;

    const itemY = y + 12 + row * 22;
    const mark = choice.selected ? "●" : "○";
    const text = `${mark} (${choice.optionNo}) ${choice.optionText}`;

    doc.font("NotoSansKR").fontSize(10.5).fillColor("#1f2937").text(text, colX, itemY, {
      width: 190,
      lineBreak: false,
    });
  });

  y += boxHeight + bottomGap;
  return y;
}

function drawSubjectiveBlock(
  doc: PDFKit.PDFDocument,
  index: number,
  question: string,
  answer: string,
  y: number
) {
  const pageBottom = 770;

  doc.font("NotoSansKR-Bold").fontSize(12);

  // 주관식도 상세보기처럼 번호 붙이려면 index 사용
  const questionText = `${index}. ${textOrDash(question)}`;

  const titleHeight = doc.heightOfString(questionText, {
    width: 470,
    lineGap: 2,
  });

  const answerTextHeight = doc.heightOfString(textOrDash(answer), {
    width: 450,
    lineGap: 3,
  });

  const boxHeight = Math.max(90, answerTextHeight + 24);
  const topGap = 12;
  const bottomGap = 24;
  const needed = titleHeight + topGap + boxHeight + bottomGap;

  if (y + needed > pageBottom) {
    doc.addPage();
    y = 40;
  }

  doc.fillColor("#111827");
  doc.font("NotoSansKR-Bold").fontSize(12).text(questionText, 60, y, {
    width: 470,
    lineGap: 2,
  });

  y += titleHeight + topGap;

  doc.rect(60, y, 475, boxHeight).stroke();

  doc.font("NotoSansKR").fontSize(10.5).fillColor("#1f2937").text(textOrDash(answer), 72, y + 12, {
    width: 450,
    lineGap: 3,
  });

  y += boxHeight + bottomGap;
  return y;
}

function drawSurveyMetaAndSignature(
  doc: PDFKit.PDFDocument,
  params: CreatePdfParams,
  y: number
) {
  const year = textOrDash(params.surveyMeta?.year);
  const month = textOrDash(params.surveyMeta?.month);
  const day = textOrDash(params.surveyMeta?.day);
  const respondentName = textOrDash(params.surveyMeta?.respondentName);

  if (y + 120 > 770) {
    doc.addPage();
    y = 40;
  }

  doc
    .fillColor("#f3f4f6")
    .rect(60, y, 475, 28)
    .fill();

  doc.fillColor("#1f2937");
  doc.font("NotoSansKR-Bold").fontSize(11).text(
    "본 서비스에 대한 의견을 확인합니다.",
    72,
    y + 7,
    { width: 450 }
  );

  y += 42;

  doc.font("NotoSansKR-Bold").fontSize(11).fillColor("#1f2937");
  doc.text(`${year}년`, 110, y, { width: 60, align: "center" });
  doc.text(`${month}월`, 190, y, { width: 60, align: "center" });
  doc.text(`${day}일`, 270, y, { width: 60, align: "center" });
  doc.text(`성명 ${respondentName}`, 350, y, { width: 120, align: "center" });

  doc.moveTo(108, y + 18).lineTo(170, y + 18).stroke();
  doc.moveTo(188, y + 18).lineTo(250, y + 18).stroke();
  doc.moveTo(268, y + 18).lineTo(330, y + 18).stroke();
  doc.moveTo(348, y + 18).lineTo(470, y + 18).stroke();

  const sigBoxX = 475;
  const sigBoxY = y - 10;
  const sigBoxW = 60;
  const sigBoxH = 36;

  doc.rect(sigBoxX, sigBoxY, sigBoxW, sigBoxH).stroke();

  const signaturePath = resolveUploadPath(params.surveyMeta?.signaturePath);
  if (signaturePath && fs.existsSync(signaturePath)) {
    try {
      doc.image(signaturePath, sigBoxX + 3, sigBoxY + 3, {
        fit: [sigBoxW - 6, sigBoxH - 6],
        align: "center",
        valign: "center",
      });
    } catch (err) {
      console.error("서명 이미지 삽입 실패:", err);
      doc.font("NotoSansKR").fontSize(9).text("서명 없음", sigBoxX, sigBoxY + 12, {
        width: sigBoxW,
        align: "center",
      });
    }
  } else {
    doc.font("NotoSansKR").fontSize(9).text("서명 없음", sigBoxX, sigBoxY + 12, {
      width: sigBoxW,
      align: "center",
    });
  }

  return y + 40;
}

export async function createWorkReportPdfBuffer(
  params: CreatePdfParams
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      registerFonts(doc);

      // 1페이지
      doc.font("NotoSansKR-Bold").fontSize(20).text(params.title, 40, 40, {
        width: 515,
        align: "center",
      });

      let y = 85;

      y = drawInfoRow(doc, y, "기관명", params.agencyName, "회사명", params.companyName);
      y = drawInfoRow(doc, y, "작업명", params.jobName, "전화번호", params.companyPhone);
      y = drawInfoRow(doc, y, "작업일자", params.workDate, "작업자", params.workerName);
      y = drawAddressRow(doc, y, params.address);

      y += 18;

      const boxW = 248;
      const boxH = 180;
      const gap = 18;

      drawImageBox(doc, 40, y, boxW, boxH, "주소 사진", params.photos.addressImage);
      drawImageBox(doc, 307, y, boxW, boxH, "작업 전 사진", params.photos.beforeImage);

      y += boxH + gap + 18;

      drawImageBox(doc, 40, y, boxW, boxH, "작업 중 사진", params.photos.duringImage);
      drawImageBox(doc, 307, y, boxW, boxH, "작업 후 사진", params.photos.afterImage);

      // 2페이지
      doc.addPage();

      let surveyY = 40;
      surveyY = drawSurveyHeader(
        doc,
        params.surveyTitle || "설문조사",
        params.surveyIntro || "",
        surveyY
      );

      if (!params.surveyAnswers.length) {
        doc.font("NotoSansKR").fontSize(11).text("설문 응답 데이터가 없습니다.", 60, surveyY);
        surveyY += 30;
      } else {
        params.surveyAnswers.forEach((item, index) => {
          if (item.type === "multiple") {
            surveyY = drawMultipleChoiceBlock(
              doc,
              index + 1,
              item.question,
              item.choices ?? [],
              surveyY
            );
          } else {
            surveyY = drawSubjectiveBlock(
              doc,
              index + 1,
              item.question,
              item.answer,
              surveyY
            );
          }
        });
      }

      surveyY = drawSurveyMetaAndSignature(doc, params, surveyY);

      if (params.memo) {
        if (surveyY + 120 > 770) {
          doc.addPage();
          surveyY = 40;
        }

        doc.font("NotoSansKR-Bold").fontSize(12).text("메모", 60, surveyY);
        surveyY += 18;
        doc.rect(60, surveyY, 475, 80).stroke();
        doc.font("NotoSansKR").fontSize(10).text(params.memo, 72, surveyY + 10, {
          width: 450,
          lineGap: 2,
        });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}