import "dotenv/config";
import express from "express";
import cors from "cors";
import { sequelize } from "./db/sequelize";
import "./models"; // ✅ 모델 import(Notice.init 등) 반드시 sync 전에 실행
import households from "./routes/households";
import path from "path";
import cookieParser from "cookie-parser";
import importRouter from "./routes/import";
import surveyRouter from "./routes/survey";
import WorkReportRouter from "./routes/workReports";
const app = express();
const corsOptions: cors.CorsOptions = { 
  origin: [
    'http://3.37.214.42',
  ],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
};
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use("/",()=>{
  console.log('인덱스');
})
app.use("/households", households);
app.use("/import", importRouter);
app.use("/survey", surveyRouter);
app.use("/work-reports", WorkReportRouter);

// ✅ DB 부트스트랩 + 테이블 생성(sync)
async function bootstrap() {
  try {
    await sequelize.authenticate();
    console.log("✅ DB 연결 성공");

    // 개발 편의 옵션:
    // force: true  -> 매번 DROP 후 CREATE (데이터 날아감)
    // alter: true  -> 스키마 변경을 테이블에 반영(개발용)
    const syncMode = (process.env.DB_SYNC_MODE || "alter") as "alter" | "force" | "none";

    if (syncMode !== "none") {
      await sequelize.sync({ [syncMode]: true } as any);
      console.log(`✅ 테이블 생성/동기화 완료 (mode=${syncMode})`);
    } else {
      console.log("ℹ️ DB_SYNC_MODE=none (sync 생략)");
    }

    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, () => {
      console.log(`✅ Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ 부팅 실패:", err);
    process.exit(1);
  }
}

bootstrap();
