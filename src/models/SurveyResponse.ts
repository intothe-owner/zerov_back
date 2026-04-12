import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from "sequelize";
import { sequelize } from "../db/sequelize";
import { Survey } from "./Survey";
import { CleanUpHousehold } from "./CleanUpHousehold";

export class SurveyResponse extends Model<
  InferAttributes<SurveyResponse>,
  InferCreationAttributes<SurveyResponse>
> {
  declare id: CreationOptional<number>;
  declare surveyId: ForeignKey<Survey["id"]>;
  declare householdId: ForeignKey<CleanUpHousehold["id"]>;

  declare respondentName: string;
  declare surveyYear: number;
  declare surveyMonth: number;
  declare surveyDay: number;

  declare signaturePath: string | null;
  declare reportMemo: string | null;
  declare submittedAt: CreationOptional<Date>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SurveyResponse.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: "설문 응답 ID",
    },
    surveyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "survey_id",
      references: {
        model: "surveys",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      comment: "설문 ID",
    },
    householdId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "household_id",
      references: {
        model: "clean_up_households",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      comment: "대상자 ID",
    },
    respondentName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "respondent_name",
      comment: "응답자 성명",
    },
    surveyYear: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "survey_year",
      comment: "응답 연도",
    },
    surveyMonth: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      field: "survey_month",
      comment: "응답 월",
    },
    surveyDay: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      field: "survey_day",
      comment: "응답 일",
    },
    signaturePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "signature_path",
      comment: "서명 이미지 경로",
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "submitted_at",
      comment: "제출일시",
    },
    reportMemo: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "report_memo",
      comment: '메모'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "created_at",
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "updated_at",
    },
  },
  {
    sequelize,
    tableName: "survey_responses",
    timestamps: true,
    underscored: true,
    comment: "설문 응답 헤더",
    indexes: [
      { name: "idx_survey_responses_survey_id", fields: ["survey_id"] },
      { name: "idx_survey_responses_household_id", fields: ["household_id"] },
      { name: "idx_survey_responses_submitted_at", fields: ["submitted_at"] },
    ],
  }
);