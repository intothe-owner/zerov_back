import "dotenv/config";
import express from "express";
import cors from "cors";
import { sequelize } from "./db/sequelize";
import "./models";
import households from "./routes/households";
import path from "path";
import cookieParser from "cookie-parser";
import importRouter from "./routes/import";
import surveyRouter from "./routes/survey";
import WorkReportRouter from "./routes/workReports";

const app = express();

const allowedOrigins = [
  "http://3.37.214.42",
  "http://3.37.214.42:3000",
];

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    console.log("요청 origin:", origin);

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use((req, _res, next) => {
  console.log("REQ:", req.method, req.originalUrl);
  next();
});

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
app.use(express.json());
app.use(cookieParser());

app.use("/households", households);
app.use("/import", importRouter);
app.use("/survey", surveyRouter);
app.use("/work-reports", WorkReportRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("전역 에러:", err);
  res.status(500).json({
    message: err?.message || "Internal Server Error",
  });
});

async function bootstrap() {
  try {
    await sequelize.authenticate();
    console.log("✅ DB 연결 성공");

    const syncMode = (process.env.DB_SYNC_MODE || "alter") as "alter" | "force" | "none";

    if (syncMode !== "none") {
      await sequelize.sync({ [syncMode]: true } as any);
      console.log(`✅ 테이블 생성/동기화 완료 (mode=${syncMode})`);
    } else {
      console.log("ℹ️ DB_SYNC_MODE=none (sync 생략)");
    }

    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server listening on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error("❌ 부팅 실패:", err);
    process.exit(1);
  }
}

bootstrap();