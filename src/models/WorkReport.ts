import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from "sequelize";
import { sequelize } from "../db/sequelize";
import { CleanUpHousehold } from "./CleanUpHousehold";
import moment from "moment";

export class WorkReport extends Model<
  InferAttributes<WorkReport>,
  InferCreationAttributes<WorkReport>
> {
  declare id: CreationOptional<number>;
  declare householdId: ForeignKey<CleanUpHousehold["id"]>;


  declare dongName: string | null;
  declare residentName: string | null;

  declare agencyName: CreationOptional<string>;
  declare companyName: CreationOptional<string>;
  declare companyPhone: CreationOptional<string>;

  declare jobName: string | null;
  declare workDate: Date | string | null;
  declare workerName: string | null;
  declare address: string | null;
  declare memo: string | null;

  declare pdfPath: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WorkReport.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    householdId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: "clean_up_households",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    
    dongName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    residentName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    agencyName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      defaultValue: "해운대구청 창조도시과",
    },
    companyName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      defaultValue: "(주)제로브이",
    },
    companyPhone: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "051-545-1150",
    },
    jobName: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    workDate: {
  type: DataTypes.DATE,
  allowNull: true,
  comment: "작업 일자",
  set(value: any) {
    if (typeof value === 'string' && value.includes('.')) {
      // "2026.04.13" 형식을 "2026-04-13"으로 바꾸거나 moment로 정확히 파싱
      const sanitizedDate = moment(value, "YYYY.MM.DD").toDate();
      this.setDataValue('workDate', sanitizedDate);
    } else {
      this.setDataValue('workDate', value);
    }
  }
},
    workerName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    memo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pdfPath: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "work_reports",
    modelName: "WorkReport",
    timestamps: true,
    indexes: [{ fields: ["householdId"] }],
  }
);