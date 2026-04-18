import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../db/sequelize";
import { SeniorCenterCleanUp } from "./SeniorCenterCleanUp";

export type ReportCategory = "AIR_CONDITIONER" | "AIR_PURIFIER";

export class SeniorCenterReport extends Model<
  InferAttributes<SeniorCenterReport>,
  InferCreationAttributes<SeniorCenterReport>
> {
  declare id: CreationOptional<number>;
  declare centerId: number; // SeniorCenterCleanUp 테이블 외래키
  declare category: ReportCategory; // 에어컨 또는 공기청정기 구분

  // 1. 경로당 입구 (1장)
  declare entranceImage: string | null;

  // 2. 작업 사진 (2장)
  declare workImage1: string | null;
  declare workImage2: string | null;

  // 3. 작업 전후 1 (2장)
  declare beforeImage1: string | null;
  declare afterImage1: string | null;

  // 4. 작업 전후 2 (2장)
  declare beforeImage2: string | null;
  declare afterImage2: string | null;

  declare workDate: CreationOptional<Date | null>;
  declare isComplete: CreationOptional<boolean>;
  declare remark: string | null;
}

SeniorCenterReport.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    centerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "center_id",
      comment: "경로당 ID (외래키)",
    },
    category: {
      type: DataTypes.ENUM("AIR_CONDITIONER", "AIR_PURIFIER"),
      allowNull: false,
      comment: "보고서 카테고리 (에어컨/공기청정기)",
    },
    // 입구 사진 (1장)
    entranceImage: {
      type: DataTypes.STRING(255),
      field: "entrance_image",
    },
    // 작업 사진 (2장)
    workImage1: { type: DataTypes.STRING(255), field: "work_image_1" },
    workImage2: { type: DataTypes.STRING(255), field: "work_image_2" },
    // 작업 전후 1 (2장)
    beforeImage1: { type: DataTypes.STRING(255), field: "before_image_1" },
    afterImage1: { type: DataTypes.STRING(255), field: "after_image_1" },
    // 작업 전후 2 (2장)
    beforeImage2: { type: DataTypes.STRING(255), field: "before_image_2" },
    afterImage2: { type: DataTypes.STRING(255), field: "after_image_2" },
    
    workDate: {
      type: DataTypes.DATEONLY,
      field: "work_date",
    },
    isComplete: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_complete",
    },
    remark: {
      type: DataTypes.TEXT,
    },
  },
  {
    sequelize,
    tableName: "senior_center_reports",
    underscored: true,
    timestamps: true,
  }
);

// 관계 설정 (Association)
SeniorCenterCleanUp.hasMany(SeniorCenterReport, {
  foreignKey: "centerId",
  as: "reports",
});
SeniorCenterReport.belongsTo(SeniorCenterCleanUp, {
  foreignKey: "centerId",
  as: "center",
});