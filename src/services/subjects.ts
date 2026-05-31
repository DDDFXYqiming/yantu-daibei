import { Subject } from '../types';

export type PillTone = 'blue' | 'teal' | 'orange' | 'red' | 'gray';

export function subjectAccent(subject: Subject): string {
  if (subject === '英语') return '#14C9C9';
  if (subject === '专业课') return '#3370FF';
  if (subject === '政治') return '#F77234';
  if (subject === '复试') return '#245BDB';
  if (subject === '调剂') return '#D92D20';
  if (subject === '行测') return '#3370FF';
  if (subject === '申论') return '#14C9C9';
  if (subject === '常识') return '#F77234';
  if (subject === '判断推理') return '#7B61FF';
  if (subject === '资料分析') return '#13A389';
  if (subject === '面试') return '#245BDB';
  return '#8F959E';
}

export function subjectSoftBg(subject: Subject): string {
  if (subject === '英语') return '#E9FBF8';
  if (subject === '专业课') return '#EEF6FF';
  if (subject === '政治') return '#FFF3E8';
  if (subject === '复试') return '#F0F6FF';
  if (subject === '调剂') return '#FFF0F0';
  if (subject === '行测') return '#EEF6FF';
  if (subject === '申论') return '#E9FBF8';
  if (subject === '常识') return '#FFF3E8';
  if (subject === '判断推理') return '#F4F0FF';
  if (subject === '资料分析') return '#EFFBF7';
  if (subject === '面试') return '#F0F6FF';
  return '#F6F7F9';
}

export function subjectTone(subject: Subject): PillTone {
  if (subject === '英语') return 'teal';
  if (subject === '专业课') return 'blue';
  if (subject === '政治') return 'orange';
  if (subject === '复试') return 'blue';
  if (subject === '调剂') return 'red';
  if (subject === '行测') return 'blue';
  if (subject === '申论') return 'teal';
  if (subject === '常识') return 'orange';
  if (subject === '判断推理') return 'blue';
  if (subject === '资料分析') return 'teal';
  if (subject === '面试') return 'blue';
  return 'gray';
}
