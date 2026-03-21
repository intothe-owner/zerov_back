import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from "sequelize";
import { sequelize } from "../db/sequelize";
import { SurveyResponse } from "./SurveyResponse";
import { SurveyQuestion } from "./SurveyQuestion";

export class SurveyResponseAnswer extends Model<
  InferAttributes<SurveyResponseAnswer>,
  InferCreationAttributes<SurveyResponseAnswer>
> {
  declare id: CreationOptional<number>;
  declare responseId: ForeignKey<SurveyResponse["id"]>;
  declare questionId: ForeignKey<SurveyQuestion["id"]>;

  declare selectedOptionNo: number | null;
  declare subjectiveAnswer: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SurveyResponseAnswer.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: "설문 문항 응답 ID",
    },
    responseId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "response_id",
      references: {
        model: "survey_responses",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      comment: "설문 응답 ID",
    },
    questionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "question_id",
      references: {
        model: "survey_questions",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      comment: "문항 ID",
    },
    selectedOptionNo: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
      field: "selected_option_no",
      comment: "객관식 선택 번호",
    },
    subjectiveAnswer: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
      field: "subjective_answer",
      comment: "주관식 답변",
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
    tableName: "survey_response_answers",
    timestamps: true,
    underscored: true,
    comment: "설문 문항별 응답",
    indexes: [
      { name: "idx_survey_response_answers_response_id", fields: ["response_id"] },
      { name: "idx_survey_response_answers_question_id", fields: ["question_id"] },
      {
        name: "uq_survey_response_answers_response_question",
        unique: true,
        fields: ["response_id", "question_id"],
      },
    ],
  }
);