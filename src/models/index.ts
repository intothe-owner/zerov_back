import { CleanUpHousehold } from "./CleanUpHousehold";
import { Survey } from "./Survey";
import { SurveyQuestion } from "./SurveyQuestion";
import { SurveyQuestionOption } from "./SurveyQuestionOption";
import { SurveyResponse } from "./SurveyResponse";
import { SurveyResponseAnswer } from "./SurveyResponseAnswer";
import { WorkReport } from "./WorkReport";
import { SeniorCenterCleanUp } from "./SeniorCenterCleanUp";
import { SeniorCenterReport } from "./SeniorCenterReport";

Survey.hasMany(SurveyQuestion, {
  foreignKey: "surveyId",
  as: "questions",
  onDelete: "CASCADE",
  hooks: true,
});

SurveyQuestion.belongsTo(Survey, {
  foreignKey: "surveyId",
  as: "survey",
});

SurveyQuestion.hasMany(SurveyQuestionOption, {
  foreignKey: "questionId",
  as: "options",
  onDelete: "CASCADE",
  hooks: true,
});

SurveyQuestionOption.belongsTo(SurveyQuestion, {
  foreignKey: "questionId",
  as: "question",
});

Survey.hasMany(SurveyResponse, {
  foreignKey: "surveyId",
  as: "responses",
  onDelete: "CASCADE",
  hooks: true,
});

SurveyResponse.belongsTo(Survey, {
  foreignKey: "surveyId",
  as: "survey",
});

CleanUpHousehold.hasMany(SurveyResponse, {
  foreignKey: "householdId",
  as: "surveyResponses",
  onDelete: "CASCADE",
  hooks: true,
});

SurveyResponse.belongsTo(CleanUpHousehold, {
  foreignKey: "householdId",
  as: "household",
});

SurveyResponse.hasMany(SurveyResponseAnswer, {
  foreignKey: "responseId",
  as: "answers",
  onDelete: "CASCADE",
  hooks: true,
});

SurveyResponseAnswer.belongsTo(SurveyResponse, {
  foreignKey: "responseId",
  as: "response",
});

SurveyQuestion.hasMany(SurveyResponseAnswer, {
  foreignKey: "questionId",
  as: "responseAnswers",
  onDelete: "CASCADE",
  hooks: true,
});

SurveyResponseAnswer.belongsTo(SurveyQuestion, {
  foreignKey: "questionId",
  as: "question",
});

CleanUpHousehold.hasMany(WorkReport, {
  foreignKey: "householdId",
  as: "workReports",
});

WorkReport.belongsTo(CleanUpHousehold, {
  foreignKey: "householdId",
  as: "household",
});
export {
  CleanUpHousehold,
  Survey,
  SurveyQuestion,
  SurveyQuestionOption,
  SurveyResponse,
  SurveyResponseAnswer,
  WorkReport,
  SeniorCenterCleanUp,
  SeniorCenterReport
};