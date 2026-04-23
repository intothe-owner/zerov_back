import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../db/sequelize";

export class ErrorReport extends Model<
  InferAttributes<ErrorReport>,
  InferCreationAttributes<ErrorReport>
> {
  declare id: CreationOptional<number>;
  declare section: string;
  declare error: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

}

ErrorReport.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: "설문조사 ID",
    },
    section: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "오류난 곳",
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "오류 원인",
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
    tableName: "error_reports",
    timestamps: true,
    underscored: true,
    comment: "오류 리포트",
  }
);