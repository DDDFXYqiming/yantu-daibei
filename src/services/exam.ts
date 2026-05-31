import { ExamType, Subject, UserProfile } from '../types';

export const EXAM_TYPES: ExamType[] = ['考研', '考公'];

export const GRADUATE_SUBJECTS: Subject[] = ['英语', '政治', '专业课', '复试', '调剂', '其他'];
export const CIVIL_SERVICE_SUBJECTS: Subject[] = ['行测', '申论', '常识', '判断推理', '资料分析', '面试', '其他'];

export function normalizeExamType(value: unknown): ExamType {
  return value === '考公' ? '考公' : '考研';
}

export function getSubjectsForExam(examType: ExamType): Subject[] {
  return examType === '考公' ? CIVIL_SERVICE_SUBJECTS : GRADUATE_SUBJECTS;
}

export function getDefaultSubject(examType: ExamType): Subject {
  return examType === '考公' ? '行测' : '专业课';
}

export function isSubjectForExam(subject: Subject, examType: ExamType): boolean {
  return getSubjectsForExam(examType).includes(subject);
}

export function subjectLabelForExam(subject: Subject, examType: ExamType): string {
  return isSubjectForExam(subject, examType) ? subject : '历史科目';
}

export function getExamCopy(profile: UserProfile) {
  const examType = normalizeExamType(profile.examType);
  if (examType === '考公') {
    return {
      examType,
      targetLabel: '目标岗位',
      majorLabel: '报考方向',
      decisionTitle: '岗位 / 面试决策',
      decisionShortcut: '岗位决策',
      decisionEmpty: '先记录一个目标岗位，后面再比较。',
      decisionRisk: '岗位和面试风险',
      primarySubjects: '行测和申论',
      materialPlaceholder: '粘贴或输入行测错题、申论素材、面试题、时政摘录……',
      materialExamples: '真题、申论素材或面试题',
      pasteDescription: '复制真题解析、申论素材或面试题后粘贴。',
      cameraDescription: '拍纸质错题、申论材料或面试题。',
      profileWeakPlaceholder: '薄弱点，如：资料分析、申论大作文、面试表达',
      targetPlaceholder: '目标岗位，如：省考税务 / 市直单位',
      majorPlaceholder: '报考方向，如：综合管理 / 行政执法',
      decisionSchoolPlaceholder: '岗位/单位，如：市直综合岗',
      decisionMajorPlaceholder: '方向，如：行政执法 / 乡镇岗',
      decisionNotePlaceholder: '备注：岗位限制、进面分、面试形式、通勤成本……',
    };
  }
  return {
    examType,
    targetLabel: '目标院校',
    majorLabel: '目标专业',
    decisionTitle: '复试 / 调剂决策',
    decisionShortcut: '院校决策',
    decisionEmpty: '先记录一个目标院校，后面再比较。',
    decisionRisk: '复试/调剂风险',
    primarySubjects: '英语和专业课',
    materialPlaceholder: '粘贴或输入讲义、真题、笔记、复试要求……',
    materialExamples: '讲义、真题或笔记',
    pasteDescription: '复制讲义、真题解析或笔记后粘贴。',
    cameraDescription: '拍纸质讲义、笔记或错题。',
    profileWeakPlaceholder: '薄弱点，如：英语基础、专业课复盘、真题带背',
    targetPlaceholder: '目标院校',
    majorPlaceholder: '目标专业',
    decisionSchoolPlaceholder: '院校，如：北京大学',
    decisionMajorPlaceholder: '专业，如：金融科技 / 临床医学',
    decisionNotePlaceholder: '备注：复试比例、学费、毕业证、是否报班……',
  };
}
