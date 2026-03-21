import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../db/sequelize";

export class Survey extends Model<
  InferAttributes<Survey>,
  InferCreationAttributes<Survey>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare intro: string | null;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Survey.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      comment: "설문조사 ID",
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "설문 제목",
    },
    intro: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "설문 안내 문구",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
      comment: "현재 활성 설문 여부",
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
    tableName: "surveys",
    timestamps: true,
    underscored: true,
    comment: "설문조사 기본 정보",
    indexes: [
      {
        name: "idx_surveys_is_active",
        fields: ["is_active"],
      },
    ],
  }
);