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

export type SurveyQuestionType = "multiple" | "subjective";

export class SurveyQuestion extends Model<
  InferAttributes<SurveyQuestion>,
  InferCreationAttributes<SurveyQuestion>
> {
  declare id: CreationOptional<number>;
  declare surveyId: ForeignKey<Survey["id"]>;
  declare type: SurveyQuestionType;
  declare question: string;
  declare sortOrder: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SurveyQuestion.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: "설문 문항 ID",
    },
    surveyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "survey_id",
      comment: "설문조사 ID",
      references: {
        model: "surveys",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    type: {
      type: DataTypes.ENUM("multiple", "subjective"),
      allowNull: false,
      comment: "문항 타입",
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "질문 내용",
    },
    sortOrder: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      field: "sort_order",
      comment: "문항 정렬 순서",
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
    tableName: "survey_questions",
    timestamps: true,
    underscored: true,
    comment: "설문 문항 정보",
    indexes: [
      {
        name: "idx_survey_questions_survey_id",
        fields: ["survey_id"],
      },
      {
        name: "idx_survey_questions_sort_order",
        fields: ["survey_id", "sort_order"],
      },
    ],
  }
);