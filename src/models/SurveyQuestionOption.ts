import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from "sequelize";
import { sequelize } from "../db/sequelize";
import { SurveyQuestion } from "./SurveyQuestion";

export class SurveyQuestionOption extends Model<
  InferAttributes<SurveyQuestionOption>,
  InferCreationAttributes<SurveyQuestionOption>
> {
  declare id: CreationOptional<number>;
  declare questionId: ForeignKey<SurveyQuestion["id"]>;
  declare optionNo: number;
  declare optionText: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SurveyQuestionOption.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: "문항 보기 ID",
    },
    questionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "question_id",
      comment: "설문 문항 ID",
      references: {
        model: "survey_questions",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    optionNo: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      field: "option_no",
      comment: "보기 번호(1~5)",
    },
    optionText: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "option_text",
      comment: "보기 내용",
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
    tableName: "survey_question_options",
    timestamps: true,
    underscored: true,
    comment: "객관식 문항 보기",
    indexes: [
      {
        name: "idx_survey_question_options_question_id",
        fields: ["question_id"],
      },
      {
        name: "uq_survey_question_options_question_id_option_no",
        unique: true,
        fields: ["question_id", "option_no"],
      },
    ],
  }
);